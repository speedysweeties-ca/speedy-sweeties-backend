import { canonical, PrivacyRecoveryJournal, RecoveryError, type RecoveryHead, type SuccessorCoverage } from "./privacyRecoveryJournal";

export type RecoveryCaseReview = {
  requestId: string; expectedStateDigest: string; action: "retain" | "remove";
  justification: string; nextReviewAt?: string;
  noJustifiedNeed?: true; restorationRiskResolved?: true; unresolvedCaseRiskResolved?: true;
  financialEvidenceProtected?: true; externalHoldsResolved?: true;
};
export type RecoveryReviewPlan = { reviewedAt: string; cases: RecoveryCaseReview[] };
const stop = (code: string): never => { throw new RecoveryError(code); };
function reviewedCases(source: PrivacyRecoveryJournal, states: Map<string, any>, plan: RecoveryReviewPlan) {
  const at = new Date(plan.reviewedAt);
  if (!Number.isFinite(at.getTime()) || at > new Date() || plan.cases.length !== states.size) stop("RECOVERY_REVIEW_REQUIRED");
  const retained = new Map<string, any>(), removed: { stateDigest: string; reviewDigest: string }[] = [], seen = new Set<string>();
  for (const row of plan.cases) {
    const state = states.get(row.requestId);
    if (!state || seen.has(row.requestId) || source.evidenceDigest(state) !== row.expectedStateDigest ||
        row.justification.trim().length < 12 || row.justification.length > 600) stop("RECOVERY_STALE_OR_INCOMPLETE_REVIEW");
    seen.add(row.requestId);
    if (row.action === "retain") {
      if (!row.nextReviewAt || !Number.isFinite(new Date(row.nextReviewAt).getTime()) || new Date(row.nextReviewAt) <= at) stop("RECOVERY_NEXT_REVIEW_REQUIRED");
      retained.set(row.requestId, { ...state, recoveryReview: { reviewedAt: at.toISOString(),
        justificationHash: source.evidenceDigest(row.justification), nextReviewAt: new Date(row.nextReviewAt).toISOString() } });
    } else if (row.action === "remove") {
      if (!["CANCELLED", "COMPLETED"].includes(state.request.status) || !state.request.closedAt ||
          state.tasks?.some((t: any) => t.status === "PENDING" || (t.status === "RETAINED_WITH_EXPIRY" && (!t.retainUntil || new Date(t.retainUntil) > at))))
        stop("RECOVERY_JUSTIFIED_HOLD_MUST_REMAIN");
      if (![row.noJustifiedNeed, row.restorationRiskResolved, row.unresolvedCaseRiskResolved, row.financialEvidenceProtected, row.externalHoldsResolved].every(v => v === true))
        stop("RECOVERY_REMOVAL_REVIEW_REQUIRED");
      removed.push({ stateDigest: source.evidenceDigest(state), reviewDigest: source.evidenceDigest(row) });
    } else stop("RECOVERY_REVIEW_REQUIRED");
  }
  return { retained, removed };
}

// Offline-only library. No HTTP/startup caller and no automatic enrollment,
// cutover or deletion. An operator supplies the reviewed, state-bound plan.
export async function prepareRecoverySuccessor(source: PrivacyRecoveryJournal, target: PrivacyRecoveryJournal,
  plan: RecoveryReviewPlan, offlineConfirmed: boolean) {
  if (offlineConfirmed !== true || source.scope === target.scope) stop("RECOVERY_OFFLINE_MAINTENANCE_REQUIRED");
  if (source.evidenceDigest("key-continuity") !== target.evidenceDigest("key-continuity")) stop("RECOVERY_KEY_MISMATCH");
  const previous = await source.inspect(); // Pending operations are never skipped.
  const { retained, removed } = reviewedCases(source, previous.cases, plan);
  const coverage: SuccessorCoverage = { sourceScope: source.scope, sourceHead: previous.sealed?.coverage.sourceHead || previous.head,
    targetScope: target.scope, sourceCount: previous.cases.size, retainedCount: retained.size, removedCount: removed.length,
    sourceDigest: source.casesDigest(previous.cases), retainedDigest: target.casesDigest(retained),
    removedDigest: source.evidenceDigest(removed), reviewDigest: source.evidenceDigest(plan), reviewedAt: new Date(plan.reviewedAt).toISOString() };
  // Verify target emptiness/identity before sealing. A partially written successor
  // is accepted only as an exact idempotent retry of the same seal/plan below.
  const targetBefore = await target.store.read();
  if (targetBefore.entries.length && (targetBefore.entries[0].kind !== "CHECKPOINT" ||
      canonical((targetBefore.entries[0].payload as any)?.coverage) !== canonical(coverage))) stop("RECOVERY_SUCCESSOR_NOT_EMPTY");
  let sealedHead: RecoveryHead;
  if (previous.sealed) {
    if (canonical(previous.sealed.coverage) !== canonical(coverage)) stop("RECOVERY_SEALED_PLAN_MISMATCH");
    sealedHead = previous.head;
  } else sealedHead = await source.maintenanceAppend(previous.head, "SEAL", { coverage });
  let head = await target.maintenanceAppend({ sequence: 0, hash: "" }, "CHECKPOINT", { format: 2, coverage, sealedHead });
  const enrollmentHash = head.hash;
  for (const state of [...retained.values()].sort((a, b) => a.request.id.localeCompare(b.request.id)))
    head = await target.maintenanceAppend(head, "CASE", state);
  head = await target.maintenanceAppend(head, "COVERED", enrollmentHash);
  const verified = await verifyRecoverySuccessor(source, target, { scope: target.scope, enrollmentHash });
  return { ...verified, coverageHead: head, trafficMayReopen: false };
}

export async function verifyRecoverySuccessor(source: PrivacyRecoveryJournal, target: PrivacyRecoveryJournal,
  externallyPinned: { scope: string; enrollmentHash: string }) {
  const before = await source.inspect(), after = await target.ready();
  if (!before.sealed || !after.checkpoint || !after.coverageHead || externallyPinned.scope !== target.scope ||
      externallyPinned.enrollmentHash !== after.enrollmentHash ||
      canonical(before.sealed.coverage) !== canonical(after.checkpoint.coverage) ||
      canonical(before.head) !== canonical(after.checkpoint.sealedHead)) stop("RECOVERY_SUCCESSOR_COVERAGE_UNVERIFIED");
  return { sourceScope: source.scope, sourceHead: before.head, successorScope: target.scope,
    enrollmentHash: after.enrollmentHash, coverageHead: after.coverageHead,
    retainedCount: after.checkpoint.coverage.retainedCount, removedCount: after.checkpoint.coverage.removedCount };
}

export async function authorizeRetiredHistoryRemoval(source: PrivacyRecoveryJournal, target: PrivacyRecoveryJournal,
  externallyPinned: { scope: string; enrollmentHash: string }, offlineConfirmed: boolean) {
  if (offlineConfirmed !== true) stop("RECOVERY_OFFLINE_MAINTENANCE_REQUIRED");
  const coverage = await verifyRecoverySuccessor(source, target, externallyPinned);
  // Permission applies only to the verified predecessor, never the active scope.
  // Actual S3 removal remains a separately authorized operator operation; the app
  // has no delete capability. Reverify immediately before reviewing the manifest.
  return { ...coverage, reviewedRetiredRemovalAllowed: true, activeHistoryRemovalAllowed: false };
}
