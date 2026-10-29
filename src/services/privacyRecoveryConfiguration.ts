import { PrivacyRecoveryJournal, RecoveryError } from "./privacyRecoveryJournal";
import { createRecoveryS3Client, S3ProtectedDecisionStore, type RecoveryS3Config } from "./privacyRecoveryS3";

export const PRIVACY_AWS_OWNER = "080413009273";
export const PRIVACY_S3_BUCKET = "speedy-sweeties-privacy-decisions-080413009273";
export function productionRecoveryConfiguration(e: NodeJS.ProcessEnv): RecoveryS3Config {
  const epoch = /^production\/epoch-(\d{4})\/$/.exec(e.PRIVACY_RECOVERY_S3_PREFIX || "")?.[1];
  if (e.PRIVACY_RECOVERY_S3_BUCKET !== PRIVACY_S3_BUCKET || e.PRIVACY_RECOVERY_S3_EXPECTED_OWNER !== PRIVACY_AWS_OWNER ||
      e.PRIVACY_RECOVERY_S3_REGION !== "ca-central-1" || !epoch || epoch === "0000" ||
      e.PRIVACY_RECOVERY_SCOPE !== `speedy-privacy-production-epoch-${epoch}` ||
      !/^[a-f0-9]{64}$/.test(e.PRIVACY_RECOVERY_ENROLLMENT_HASH || ""))
    throw new RecoveryError("RECOVERY_PRODUCTION_CONFIGURATION_REQUIRED");
  return { bucket: PRIVACY_S3_BUCKET, ownerAccountId: PRIVACY_AWS_OWNER, prefix: e.PRIVACY_RECOVERY_S3_PREFIX!,
    scope: e.PRIVACY_RECOVERY_SCOPE!, mode: "active", genesisHash: e.PRIVACY_RECOVERY_ENROLLMENT_HASH! };
}
export function configuredPrivacyRecovery(e: NodeJS.ProcessEnv = process.env) {
  const config = productionRecoveryConfiguration(e);
  if (!e.PRIVACY_DIGEST_KEY || e.PRIVACY_DIGEST_KEY.length < 32 || e.PRIVACY_DIGEST_KEY === e.JWT_SECRET ||
      !e.AWS_ACCESS_KEY_ID || !e.AWS_SECRET_ACCESS_KEY || e.AWS_SESSION_TOKEN || e.AWS_ROLE_ARN || e.AWS_WEB_IDENTITY_TOKEN_FILE)
    throw new RecoveryError("RECOVERY_DEDICATED_CREDENTIALS_REQUIRED");
  // Hobby uses the existing dedicated IAM user's saved credentials. Snapshot the
  // process values privately; do not fall through to profiles/metadata/OIDC/JWT.
  const credentials = { accessKeyId: e.AWS_ACCESS_KEY_ID, secretAccessKey: e.AWS_SECRET_ACCESS_KEY };
  return new PrivacyRecoveryJournal(new S3ProtectedDecisionStore(config, createRecoveryS3Client(credentials)), config.scope, e.PRIVACY_DIGEST_KEY);
}
