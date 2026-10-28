import { createHmac, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

// This port is deliberately NOT implemented by a local file or the application DB.
// A production adapter must provide durable, linearizable append/CAS and a current
// independently protected head (never a head recovered from the database backup).
export type RecoveryHead = { sequence: number; hash: string };
export type RecoveryEntry = RecoveryHead & {
  previous: string; scope: string; kind: "GENESIS" | "INTENT" | "COMMIT";
  operation: string; payload: unknown;
};
export interface ProtectedDecisionStore {
  read(): Promise<{ head: RecoveryHead; entries: RecoveryEntry[] }>;
  append(expected: RecoveryHead, entry: RecoveryEntry): Promise<void>;
}
export class RecoveryError extends Error {
  constructor(public code: string) { super(code); }
}
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
  async ready() {
    const { head, entries } = await this.store.read();
    if (!entries.length || entries[0].kind !== "GENESIS") throw new RecoveryError("RECOVERY_COVERAGE_REQUIRED");
    let prior: RecoveryHead = { sequence: 0, hash: "" };
    let pending: RecoveryEntry | undefined;
    const cases = new Map<string, any>();
    for (const entry of entries) {
      const { hash, ...value } = entry;
      if (entry.scope !== this.scope || entry.sequence !== prior.sequence + 1 || entry.previous !== prior.hash || hash !== this.seal(value))
        throw new RecoveryError("RECOVERY_HISTORY_INVALID");
      if (entry.sequence === 1) {
        if (canonical(entry.payload) !== canonical({ format: 1, emptyDecisionBaseline: true })) throw new RecoveryError("RECOVERY_COVERAGE_REQUIRED");
      } else if (entry.kind === "INTENT" && !pending) pending = entry;
      else if (entry.kind === "COMMIT" && pending && entry.operation === pending.operation && entry.payload === pending.hash) {
        const payload = pending.payload as { state: { request: { id: string } } };
        if (!payload?.state?.request?.id) throw new RecoveryError("RECOVERY_HISTORY_INVALID");
        cases.set(payload.state.request.id, payload.state);
        pending = undefined;
      } else throw new RecoveryError("RECOVERY_HISTORY_INVALID");
      prior = { sequence: entry.sequence, hash };
    }
    if (prior.sequence !== head.sequence || prior.hash !== head.hash) throw new RecoveryError("RECOVERY_HISTORY_INCOMPLETE");
    if (pending) throw new RecoveryError("RECOVERY_UNFINISHED_OPERATION");
    return { head, cases };
  }
  async intent(head: RecoveryHead, event: string, state: unknown) {
    const operation = randomUUID();
    const next = await this.append(head, "INTENT", operation, { event, state });
    return { head: next, operation };
  }
  async committed(intent: { head: RecoveryHead; operation: string }) {
    await this.append(intent.head, "COMMIT", intent.operation, intent.head.hash);
  }
}
