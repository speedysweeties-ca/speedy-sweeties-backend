import { createHmac, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

// This port is deliberately NOT implemented by a local file or the application DB.
// A production adapter must provide durable, linearizable append/CAS and a current
// independently protected head (never a head recovered from the database backup).
export type RecoveryHead = { sequence: number; hash: string };
export type RecoveryEntry = RecoveryHead & {
  previous: string; scope: string; kind: "GENESIS" | "INTENT" | "COMMIT" | "RESOLVE" | "SEAL" | "CHECKPOINT" | "CASE" | "COVERED";
  operation: string; payload: unknown;
};
export interface ProtectedDecisionStore {
  read(): Promise<{ head: RecoveryHead; entries: RecoveryEntry[] }>;
  append(expected: RecoveryHead, entry: RecoveryEntry): Promise<void>;
}
export class RecoveryError extends Error {
  constructor(public code: string) { super(code); }
}
export type SuccessorCoverage = {
  sourceScope: string; sourceHead: RecoveryHead; targetScope: string;
  sourceCount: number; retainedCount: number; removedCount: number;
  sourceDigest: string; retainedDigest: string; removedDigest: string; reviewDigest: string;
  reviewedAt: string;
};
export const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as object).sort().map(k => `${JSON.stringify(k)}:${canonical((value as any)[k])}`).join(",")}}`;
};
export class PrivacyRecoveryJournal {
  constructor(readonly store: ProtectedDecisionStore, readonly scope: string, private key: string) {
    if (!scope || key.length < 16) throw new RecoveryError("RECOVERY_CONFIGURATION_REQUIRED");
  }
  private seal(value: Omit<RecoveryEntry, "hash">) {
    return createHmac("sha256", this.key).update(`privacy-recovery-v1:${canonical(value)}`).digest("hex");
  }
  evidenceDigest(value: unknown) {
    return createHmac("sha256", this.key).update(`privacy-recovery-evidence-v1:${canonical(value)}`).digest("hex");
  }
  casesDigest(cases: Map<string, any>) {
    return this.evidenceDigest([...cases.values()].sort((a, b) => a.request.id.localeCompare(b.request.id)));
  }
  private async append(head: RecoveryHead, kind: RecoveryEntry["kind"], operation: string, payload: unknown) {
    const value = { sequence: head.sequence + 1, previous: head.hash, scope: this.scope, kind, operation, payload };
    const entry = { ...value, hash: this.seal(value) };
    await this.store.append(head, entry);
    return { sequence: entry.sequence, hash: entry.hash };
  }
  // Explicit coverage enrollment, never automatic on startup or after a restore.
  async enrollEmptyDatabase(db: PrismaClient) {
    const state = await this.store.read();
    if (state.head.sequence || state.head.hash || state.entries.length) throw new RecoveryError("RECOVERY_ALREADY_ENROLLED");
    if (await db.privacyDeletionRequest.count() || await db.privacyDeletedIdentity.count() ||
        await db.privacyAudit.count() || await db.privacyExternalTask.count())
      throw new RecoveryError("RECOVERY_EXISTING_DECISIONS_REQUIRE_REVIEW");
    await this.append(state.head, "GENESIS", "coverage", { format: 1, emptyDecisionBaseline: true });
  }
  async ready() { return this.inspect(false); }
  // Offline maintenance only. Normal consumers must reject sealed predecessors.
  async inspect(allowSealed = true, allowPending = false) {
    const { head, entries } = await this.store.read();
    if (!entries.length || !["GENESIS", "CHECKPOINT"].includes(entries[0].kind)) throw new RecoveryError("RECOVERY_COVERAGE_REQUIRED");
    let prior: RecoveryHead = { sequence: 0, hash: "" };
    let pending: RecoveryEntry | undefined;
    const cases = new Map<string, any>();
    let checkpoint: { format: number; coverage: SuccessorCoverage; sealedHead: RecoveryHead } | undefined;
    let coverageHead: RecoveryHead | undefined;
    let sealed: { coverage: SuccessorCoverage } | undefined;
    const validCoverage = (c: SuccessorCoverage) => c && c.targetScope && c.sourceScope && c.targetScope !== c.sourceScope &&
      Number.isSafeInteger(c.sourceHead?.sequence) && c.sourceHead.sequence >= 1 && /^[a-f0-9]{64}$/.test(c.sourceHead.hash) &&
      [c.sourceCount, c.retainedCount, c.removedCount].every(n => Number.isSafeInteger(n) && n >= 0) &&
      c.retainedCount + c.removedCount === c.sourceCount &&
      [c.sourceDigest, c.retainedDigest, c.removedDigest, c.reviewDigest].every(h => /^[a-f0-9]{64}$/.test(h)) &&
      typeof c.reviewedAt === "string" && !Number.isNaN(new Date(c.reviewedAt).getTime());
    for (const entry of entries) {
      const { hash, ...value } = entry;
      if (entry.scope !== this.scope || entry.sequence !== prior.sequence + 1 || entry.previous !== prior.hash || hash !== this.seal(value))
        throw new RecoveryError("RECOVERY_HISTORY_INVALID");
      if (entry.sequence === 1) {
        if (entry.kind === "GENESIS") {
          if (canonical(entry.payload) !== canonical({ format: 1, emptyDecisionBaseline: true })) throw new RecoveryError("RECOVERY_COVERAGE_REQUIRED");
        } else {
          checkpoint = entry.payload as typeof checkpoint;
          if (checkpoint?.format !== 2 || !validCoverage(checkpoint.coverage) || checkpoint.coverage.targetScope !== this.scope ||
              checkpoint.sealedHead?.sequence !== checkpoint.coverage.sourceHead.sequence + 1 || !/^[a-f0-9]{64}$/.test(checkpoint.sealedHead.hash))
            throw new RecoveryError("RECOVERY_CHECKPOINT_INVALID");
        }
      } else if (sealed) throw new RecoveryError("RECOVERY_SEALED_HISTORY_CHANGED");
      else if (checkpoint && !coverageHead) {
        if (entry.kind === "CASE") {
          const state = entry.payload as any;
          if (!state?.request?.id || cases.has(state.request.id) || cases.size >= checkpoint.coverage.retainedCount)
            throw new RecoveryError("RECOVERY_CHECKPOINT_INVALID");
          cases.set(state.request.id, state);
        } else if (entry.kind === "COVERED" && entry.payload === entries[0].hash &&
            cases.size === checkpoint.coverage.retainedCount && this.casesDigest(cases) === checkpoint.coverage.retainedDigest)
          coverageHead = { sequence: entry.sequence, hash };
        else throw new RecoveryError("RECOVERY_CHECKPOINT_INVALID");
      } else if (entry.kind === "SEAL" && !pending) {
        sealed = entry.payload as typeof sealed;
        const c = sealed?.coverage;
        if (!c || !validCoverage(c) || c.sourceScope !== this.scope || canonical(c.sourceHead) !== canonical(prior) ||
            c.sourceCount !== cases.size || c.sourceDigest !== this.casesDigest(cases)) throw new RecoveryError("RECOVERY_SEAL_INVALID");
      } else if (entry.kind === "INTENT" && !pending) pending = entry;
      else if (entry.kind === "COMMIT" && pending && entry.operation === pending.operation && entry.payload === pending.hash) {
        const payload = pending.payload as { state: { request: { id: string } } };
        if (!payload?.state?.request?.id) throw new RecoveryError("RECOVERY_HISTORY_INVALID");
        const state = payload.state as any, previous = cases.get(state.request.id);
        // A subsequent DB snapshot must not lose a separately justified review.
        cases.set(state.request.id, previous?.recoveryReview && !state.recoveryReview ? { ...state, recoveryReview: previous.recoveryReview } : state);
        pending = undefined;
      } else if (entry.kind === "RESOLVE" && pending && entry.operation === pending.operation) {
        const p = entry.payload as any;
        if (p?.format !== 1 || p.intentHash !== pending.hash || !["COMMITTED", "NOT_COMMITTED"].includes(p.outcome) ||
            ![p.evidenceDigest, p.reviewDigest].every(h => /^[a-f0-9]{64}$/.test(h)))
          throw new RecoveryError("RECOVERY_RESOLUTION_INVALID");
        const intent = pending.payload as any;
        const expected = p.outcome === "COMMITTED" ? intent.afterEvidenceDigest : intent.beforeEvidenceDigest;
        if (intent.format !== 2 || !expected || expected !== p.evidenceDigest)
          throw new RecoveryError("RECOVERY_RESOLUTION_INVALID");
        if (p.outcome === "COMMITTED") {
          const state = intent.state, previous = cases.get(state.request.id);
          cases.set(state.request.id, previous?.recoveryReview && !state.recoveryReview ? { ...state, recoveryReview: previous.recoveryReview } : state);
        }
        pending = undefined;
      } else throw new RecoveryError("RECOVERY_HISTORY_INVALID");
      prior = { sequence: entry.sequence, hash };
    }
    if (prior.sequence !== head.sequence || prior.hash !== head.hash) throw new RecoveryError("RECOVERY_HISTORY_INCOMPLETE");
    if (checkpoint && !coverageHead) throw new RecoveryError("RECOVERY_UNFINISHED_COVERAGE");
    if (pending && !allowPending) throw new RecoveryError("RECOVERY_UNFINISHED_OPERATION");
    if (sealed && !allowSealed) throw new RecoveryError("RECOVERY_SCOPE_SEALED");
    return { head, cases, checkpoint, coverageHead, sealed, pending, lastEntry: entries.at(-1), enrollmentHash: entries[0].hash };
  }
  async maintenanceAppend(head: RecoveryHead, kind: "SEAL" | "CHECKPOINT" | "CASE" | "COVERED", payload: unknown) {
    return this.append(head, kind, "reviewed-maintenance", payload);
  }
  async intent(head: RecoveryHead, event: string, state: unknown, evidence?: {
    beforeEvidenceDigest: string | null; afterEvidenceDigest: string;
  }) {
    const operation = randomUUID();
    const next = await this.append(head, "INTENT", operation, { event, state,
      ...(evidence ? { format: 2, ...evidence } : {}) });
    return { head: next, operation };
  }
  async committed(intent: { head: RecoveryHead; operation: string }) {
    await this.append(intent.head, "COMMIT", intent.operation, intent.head.hash);
  }
  // Offline operator only. Authorization/evidence comparison is performed by the
  // guarded operator path. No historical entry is overwritten or removed.
  async resolvePending(expected: RecoveryHead, outcome: "COMMITTED" | "NOT_COMMITTED", evidenceDigest: string, reviewDigest: string) {
    if (!/^[a-f0-9]{64}$/.test(evidenceDigest) || !/^[a-f0-9]{64}$/.test(reviewDigest)) throw new RecoveryError("RECOVERY_OUTCOME_EVIDENCE_REQUIRED");
    const current = await this.inspect(false, true);
    if (!current.pending || canonical(current.head) !== canonical(expected)) throw new RecoveryError("RECOVERY_STALE_PLAN");
    const intentPayload = current.pending.payload as any;
    if (intentPayload.format !== 2 || !evidenceDigest ||
        evidenceDigest !== (outcome === "COMMITTED" ? intentPayload.afterEvidenceDigest : intentPayload.beforeEvidenceDigest))
      throw new RecoveryError("RECOVERY_OUTCOME_EVIDENCE_REQUIRED");
    const payload = { format: 1, intentHash: current.pending.hash, outcome, evidenceDigest, reviewDigest };
    try { await this.append(current.head, "RESOLVE", current.pending.operation, payload); }
    catch {
      // Even if the transport lost the acknowledgement, never issue another PUT.
      // Accept only the exact authenticated resolution at the expected next head.
      let observed;
      try { observed = await this.inspect(false, true); } catch { throw new RecoveryError("RECOVERY_WRITE_UNCERTAIN"); }
      if (observed.pending || observed.head.sequence !== expected.sequence + 1 || observed.lastEntry?.kind !== "RESOLVE" ||
          observed.lastEntry.operation !== current.pending.operation || canonical(observed.lastEntry.payload) !== canonical(payload))
        throw new RecoveryError("RECOVERY_WRITE_UNCERTAIN");
    }
  }
}
