import { DeleteObjectCommand, ListObjectVersionsCommand } from "@aws-sdk/client-s3";
import { productionRecoveryConfiguration, PRIVACY_AWS_OWNER, PRIVACY_S3_BUCKET } from "./privacyRecoveryConfiguration";
import { PrivacyRecoveryJournal, RecoveryError } from "./privacyRecoveryJournal";
import { authorizeRetiredHistoryRemoval } from "./privacyRecoveryMaintenance";

type OperatorTransport = { send(command: ListObjectVersionsCommand | DeleteObjectCommand, options: { abortSignal: AbortSignal }): Promise<any> };

// Explicit offline operator library ONLY. No public route, default credential
// source or startup call. The bucket currently denies these production deletes;
// a separately approved retired-prefix-only policy change is still required.
export async function removeVerifiedRetiredS3History(source: PrivacyRecoveryJournal, successor: PrivacyRecoveryJournal,
  externalConfiguration: NodeJS.ProcessEnv, offlineConfirmed: boolean, operator: OperatorTransport) {
  const active = productionRecoveryConfiguration(externalConfiguration);
  const oldEpoch = /^speedy-privacy-production-epoch-(\d{4})$/.exec(source.scope)?.[1];
  if (!oldEpoch || oldEpoch === "0000" || source.scope === active.scope || successor.scope !== active.scope)
    throw new RecoveryError("RECOVERY_RETIRED_TARGET_REJECTED");
  const prefix = `production/epoch-${oldEpoch}/`, target = { Bucket: PRIVACY_S3_BUCKET, ExpectedBucketOwner: PRIVACY_AWS_OWNER };
  const pin = { scope: active.scope, enrollmentHash: active.genesisHash! };
  const permit = await authorizeRetiredHistoryRemoval(source, successor, pin, offlineConfirmed);
  const versions: { Key: string; VersionId: string; IsLatest?: boolean }[] = [];
  let keyMarker: string | undefined, versionMarker: string | undefined;
  const markers = new Set<string>();
  const inventory = async () => {
    let response;
    try { response = await operator.send(new ListObjectVersionsCommand({ ...target, Prefix: prefix, MaxKeys: 1000,
      KeyMarker: keyMarker, VersionIdMarker: versionMarker }), { abortSignal: AbortSignal.timeout(4000) }); }
    catch { throw new RecoveryError("RECOVERY_OPERATOR_INVENTORY_UNAVAILABLE"); }
    return response;
  };
  for (;;) {
    const page = await inventory();
    if (page.DeleteMarkers?.length || !Array.isArray(page.Versions) || typeof page.IsTruncated !== "boolean")
      throw new RecoveryError("RECOVERY_RETIRED_INVENTORY_REVIEW_REQUIRED");
    for (const version of page.Versions) {
      if (!new RegExp(`^${prefix}[0-9]{16}\\.json$`).test(version.Key || "") || typeof version.VersionId !== "string" ||
          !version.VersionId || versions.length >= 20000) throw new RecoveryError("RECOVERY_RETIRED_TARGET_REJECTED");
      versions.push(version);
    }
    if (!page.IsTruncated) break;
    keyMarker = page.NextKeyMarker; versionMarker = page.NextVersionIdMarker;
    const marker = JSON.stringify([keyMarker, versionMarker]);
    if (!keyMarker || !versionMarker || markers.has(marker)) throw new RecoveryError("RECOVERY_RETIRED_INVENTORY_REVIEW_REQUIRED");
    markers.add(marker);
  }
  const current = versions.filter(v => v.IsLatest).map(v => v.Key).sort();
  if (new Set(versions.map(v => JSON.stringify([v.Key, v.VersionId]))).size !== versions.length)
    throw new RecoveryError("RECOVERY_RETIRED_INVENTORY_REVIEW_REQUIRED");
  if (current.length !== permit.sourceHead.sequence || current.some((key, i) => key !== `${prefix}${String(i + 1).padStart(16, "0")}.json`))
    throw new RecoveryError("RECOVERY_RETIRED_INVENTORY_REVIEW_REQUIRED");
  await authorizeRetiredHistoryRemoval(source, successor, pin, offlineConfirmed);
  let deletedVersions = 0;
  try {
    for (const version of versions) {
      await operator.send(new DeleteObjectCommand({ ...target, Key: version.Key, VersionId: version.VersionId }), { abortSignal: AbortSignal.timeout(4000) });
      deletedVersions++;
    }
    keyMarker = undefined; versionMarker = undefined;
    const left = await inventory();
    const empty = !(left.Versions?.length || left.DeleteMarkers?.length || left.IsTruncated);
    return { retiredScope: source.scope, deletedVersions, allVersionsRemoved: empty, operatorReviewRequired: !empty,
      activeScopeUnchanged: true, trafficMayReopen: false };
  } catch {
    // Stop immediately. Do not retry partial deletion or invent a completion.
    // The signed complete successor remains independently readable; an operator
    // must review the remaining version manifest against the prior permit.
    return { retiredScope: source.scope, deletedVersions, allVersionsRemoved: false, operatorReviewRequired: true,
      activeScopeUnchanged: true, trafficMayReopen: false };
  }
}
