import { z } from "zod";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { PrivacyDeletionService } from "./privacyDeletion.service";
import { canonical, PrivacyRecoveryJournal, RecoveryError, type RecoveryHead } from "./privacyRecoveryJournal";
import { scopedRecoveryEvidence } from "./privacyRecoveryEvidence";
import { reconcileRecoveryTransaction } from "./privacyRecovery.service";

export const OPERATOR_WORKSPACE = "tea-d7loaul7vvec73cme5d0";
export const OPERATOR_API = "srv-d7ntlnpkh4rs73bev9q0";
export const OPERATOR_PRODUCTION_DB = "dpg-d7m33g2qqhas73f58hrg-a";
export const OPERATOR_BUCKET = "speedy-sweeties-privacy-decisions-080413009273";
export const OPERATOR_ACCOUNT = "080413009273";
const forbidden = ["dpg-davbqnhsrm7s73bd3uq0-a", "dpg-dbe37v59fdbs73961o3g-a", "dpg-dbg14b59el5s73bj1sm0-a"];
const reference = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:/._-]{7,199}$/);
const evidence = z.object({ reference, verifiedAt: z.string().datetime(), expiresAt: z.string().datetime() }).strict();
export const operatorApprovalSchema = z.object({
  format: z.literal(1), operation: z.enum(["enrollment", "reconcile", "resolve"]),
  workspaceId: z.literal(OPERATOR_WORKSPACE), serviceId: z.literal(OPERATOR_API),
  resourceId: z.string().regex(/^dpg-[a-z0-9]{20}-a$/), hostname: z.string(), databaseName: z.string().regex(/^[a-zA-Z0-9_]+$/),
  databaseUser: z.string().regex(/^[a-zA-Z0-9_]+$/), sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
  ownerAccountId: z.literal(OPERATOR_ACCOUNT), bucket: z.literal(OPERATOR_BUCKET), region: z.literal("ca-central-1"),
  prefix: z.string(), scope: z.string(), enrollmentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  operatorArn: z.string(), awsProfile: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  mfa: evidence, exclusion: evidence.extend({ allWritersStopped: z.literal(true) }).strict(),
  pinRecordReference: reference, approvedAt: z.string().datetime(), expiresAt: z.string().datetime(),
  originalDatabaseNotRestoredSinceIntent: z.literal(true).optional(), outcomeEvidenceReference: reference.optional(),
  restoredFromProduction: z.literal(true).optional(), restorePoint: z.string().datetime().optional()
}).strict();
export type OperatorApproval = z.infer<typeof operatorApprovalSchema>;
export type OperatorTarget = { workspaceId: string; resourceId: string; hostname: string; databaseName: string; databaseUser: string; status: string };
export type OperatorPlan = { format: 1; operation: string; authorizationDigest: string; databaseDigest: string;
  journalHead: RecoveryHead; issuedAt: string; expiresAt: string; outcome?: "COMMITTED" | "NOT_COMMITTED";
  evidenceDigest?: string; planDigest: string };
export type OperatorDependencies = {
  db: PrismaClient; journal: PrivacyRecoveryJournal; service: PrivacyDeletionService;
  verifyTarget(): Promise<OperatorTarget>; identity(): Promise<{ Account: string; Arn: string }>;
  versions(): Promise<{ key: string; latest: boolean; marker: boolean }[]>;
  databaseUrl: string; digestKey: string; sourceRevision: string; now?: () => number;
};
const stop = (code: string): never => { throw new RecoveryError(code); };

export function validateOperatorApproval(input: unknown, databaseUrl: string, sourceRevision: string, now = Date.now()) {
  const parsed = operatorApprovalSchema.safeParse(input);
  if (!parsed.success) stop("OPERATOR_APPROVAL_REQUIRED");
  const a = parsed.data;
  for (const period of [{ verifiedAt: a.approvedAt, expiresAt: a.expiresAt }, a.mfa, a.exclusion]) {
    const start = Date.parse(period.verifiedAt), end = Date.parse(period.expiresAt);
    if (start > now || end <= now || end - start > 30 * 60_000 || start < now - 30 * 60_000) stop("OPERATOR_APPROVAL_EXPIRED");
  }
  if (a.sourceRevision !== sourceRevision || forbidden.includes(a.resourceId) ||
      !new RegExp(`^arn:aws:(?:iam::${OPERATOR_ACCOUNT}:user/[A-Za-z0-9+=,.@_/-]+|sts::${OPERATOR_ACCOUNT}:assumed-role/[A-Za-z0-9+=,.@_-]+/[A-Za-z0-9+=,.@_-]+)$`).test(a.operatorArn) ||
      /SpeedyPrivacyJournalApplication/.test(a.operatorArn)) stop("OPERATOR_TARGET_REJECTED");
  let url: URL;
  try { url = new URL(databaseUrl); } catch { stop("OPERATOR_TARGET_REJECTED"); }
  if (!["postgres:", "postgresql:"].includes(url!.protocol) || url!.hostname !== a.hostname ||
      a.hostname !== `${a.resourceId}.ohio-postgres.render.com` || url!.port && url!.port !== "5432" ||
      decodeURIComponent(url!.pathname) !== `/${a.databaseName}` || decodeURIComponent(url!.username) !== a.databaseUser || !url!.password ||
      [...url!.searchParams.keys()].some(k => !["sslmode", "schema", "connection_limit", "connect_timeout", "pool_timeout"].includes(k)) ||
      url!.searchParams.get("sslmode") !== "require" || url!.searchParams.has("schema") && url!.searchParams.get("schema") !== "public" || url!.hash)
    stop("OPERATOR_TARGET_REJECTED");
  const epoch = /^production\/epoch-(\d{4})\/$/.exec(a.prefix)?.[1];
  if (!epoch || epoch === "0000" || a.scope !== `speedy-privacy-production-epoch-${epoch}`) stop("OPERATOR_TARGET_REJECTED");
  if (a.operation === "enrollment" && (a.resourceId !== OPERATOR_PRODUCTION_DB || a.databaseName !== "speedy_sweeties_db" ||
      epoch !== "0001" || a.enrollmentHash)) stop("OPERATOR_TARGET_REJECTED");
  if (a.operation !== "enrollment" && !a.enrollmentHash) stop("OPERATOR_ENROLLMENT_PIN_REQUIRED");
  if (a.operation === "resolve" && (a.resourceId !== OPERATOR_PRODUCTION_DB ||
      a.originalDatabaseNotRestoredSinceIntent !== true || !a.outcomeEvidenceReference)) stop("OPERATOR_AUTHORITATIVE_OUTCOME_REQUIRED");
  if (a.operation === "reconcile" && (!a.restoredFromProduction || !a.restorePoint)) stop("OPERATOR_RESTORE_APPROVAL_REQUIRED");
  return a;
}

export async function privacyBaseline(tx: Prisma.TransactionClient) {
  const result = await tx.$queryRaw<{ kind: string; count: number }[]>`
    SELECT 'challenge' AS kind, count(*)::int AS count FROM "PrivacyChallenge"
    UNION ALL SELECT 'access', count(*)::int FROM "PrivacyAccessCredential"
    UNION ALL SELECT 'request', count(*)::int FROM "PrivacyDeletionRequest"
    UNION ALL SELECT 'audit', count(*)::int FROM "PrivacyAudit"
    UNION ALL SELECT 'task', count(*)::int FROM "PrivacyExternalTask"
    UNION ALL SELECT 'marker', count(*)::int FROM "PrivacyDeletedIdentity"
    UNION ALL SELECT 'customer', count(*)::int FROM "Customer" WHERE "privacyVerifiedEmail" IS NOT NULL OR "privacyVerifiedEmailAt" IS NOT NULL
    UNION ALL SELECT 'order', count(*)::int FROM "Order" WHERE "privacyErasedAt" IS NOT NULL OR "privacyRetainUntil" IS NOT NULL
    UNION ALL SELECT 'receipt', count(*)::int FROM "DigitalReceipt" WHERE "retainedChargeEvidence" IS NOT NULL`;
  if (result.length !== 9 || result.some(r => !Number.isSafeInteger(r.count) || r.count < 0)) stop("OPERATOR_BASELINE_UNAVAILABLE");
  return result;
}

// Server-side SHA-256 aggregates only; no customer data in the plan or logs.
export async function operatorDatabaseDigest(tx: Prisma.TransactionClient, journal: PrivacyRecoveryJournal) {
  const tables = await tx.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  if (!tables.length || tables.length > 200 || tables.some(t => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.tablename))) stop("OPERATOR_SCHEMA_REQUIRED");
  const values: unknown[] = [];
  values.push(await tx.$queryRaw`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns
    WHERE table_schema='public' ORDER BY table_name,ordinal_position`);
  values.push(await tx.$queryRaw`SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition,p.prosrc
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname='public' ORDER BY c.relname,t.tgname`);
  values.push(await tx.$queryRaw`SELECT c.relname,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k
    JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,k.conname`);
  for (const { tablename } of tables) {
    const rows = await tx.$queryRawUnsafe(`SELECT count(*)::text AS count,
      encode(sha256(convert_to(COALESCE(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),''
      ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex') AS digest FROM "${tablename}" t`);
    values.push([tablename, rows]);
  }
  return journal.evidenceDigest(values);
}

async function validateDatabase(tx: Prisma.TransactionClient, a: OperatorApproval) {
  const rows = await tx.$queryRaw<{ name: string; owner: string }[]>`SELECT current_database() AS name,current_user AS owner`;
  if (rows[0]?.name !== a.databaseName || rows[0]?.owner !== a.databaseUser) stop("OPERATOR_TARGET_REJECTED");
  const guards = await tx.$queryRaw<{ tgname: string; relname: string; tgtype: number; tgenabled: string; proname: string; prosrc: string }[]>`
    SELECT t.tgname,c.relname,t.tgtype::int,t.tgenabled,p.proname,p.prosrc FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname='public'
    AND t.tgname IN ('privacy_retained_order_guard','privacy_receipt_guard','privacy_item_guard','privacy_help_guard')`;
  const sql = readFileSync(join(__dirname, '../../prisma/migrations/20261023030000_customer_privacy_requests/migration.sql'), 'utf8');
  const bodies = new Map([...sql.matchAll(/CREATE FUNCTION (privacy_[a-z_]+)\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$([\s\S]*?)\$\$;/g)].map(m => [m[1], m[2].trim()]));
  const expected: Record<string, [string, number, string]> = { privacy_retained_order_guard: ['Order', 27, 'privacy_retained_order_guard'],
    privacy_receipt_guard: ['DigitalReceipt', 31, 'privacy_retained_child_guard'], privacy_item_guard: ['OrderItem', 31, 'privacy_retained_child_guard'],
    privacy_help_guard: ['DeliveryHelpRequest', 23, 'privacy_retained_child_guard'] };
  const failed = await tx.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
  const applied = await tx.$queryRaw<{ migration_name: string; finished_at: Date }[]>`SELECT migration_name,finished_at FROM "_prisma_migrations"
    WHERE migration_name IN ('20261023030000_customer_privacy_requests','20261023150000_privacy_access_credentials',
      '20261023190000_adopt_retention_policy','20261023220000_approved_privacy_review_dates') AND finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at`;
  if (guards.length !== 4 || new Set(guards.map(g => g.tgname)).size !== 4 || guards.some(g => {
      const e = expected[g.tgname]; return !e || g.relname !== e[0] || g.tgtype !== e[1] || g.tgenabled !== 'O' || g.proname !== e[2] || g.prosrc.trim() !== bodies.get(e[2]);
    }) || failed[0]?.count !== 0 || applied.length !== 4 ||
      applied.map(r => r.migration_name).join() !== [...applied.map(r => r.migration_name)].sort().join()) stop("OPERATOR_SCHEMA_REQUIRED");
}

async function outcomeEvidence(tx: Prisma.TransactionClient, journal: PrivacyRecoveryJournal) {
  const history = await journal.inspect(false, true), pending = history.pending;
  if (!pending) return { history, outcome: undefined, evidenceDigest: undefined };
  const p = pending.payload as any;
  if (p.format !== 2 || !p.state?.scope || !p.beforeEvidenceDigest || !p.afterEvidenceDigest) stop("OPERATOR_LEGACY_OUTCOME_EVIDENCE_REQUIRED");
  const request = await tx.privacyDeletionRequest.findUnique({ where: { id: p.state.request.id } });
  const observed = !request ? journal.evidenceDigest({ requestAbsent: p.state.request.id }) :
    await scopedRecoveryEvidence(tx, journal, p.state.request.id, p.state.scope);
  const before = observed === p.beforeEvidenceDigest, after = observed === p.afterEvidenceDigest;
  if (before === after) stop("OPERATOR_OUTCOME_AMBIGUOUS");
  return { history, outcome: after ? "COMMITTED" as const : "NOT_COMMITTED" as const, evidenceDigest: observed };
}

export async function runPrivacyOperator(input: unknown, action: "preflight" | "enroll" | "dry-run" | "apply" | "resolve",
  deps: OperatorDependencies, suppliedPlan?: OperatorPlan, authorized = false) {
  const now = deps.now || Date.now;
  const a = validateOperatorApproval(input, deps.databaseUrl, deps.sourceRevision, now());
  if (deps.digestKey.length < 32) stop("OPERATOR_STABLE_KEY_REQUIRED");
  const writes = ["enroll", "apply", "resolve"].includes(action);
  if (writes && !authorized) stop("OPERATOR_EXPLICIT_AUTHORIZATION_REQUIRED");
  if ((a.operation === "enrollment" && !["preflight", "enroll"].includes(action)) ||
      (a.operation === "reconcile" && !["dry-run", "apply"].includes(action)) ||
      (a.operation === "resolve" && !["preflight", "resolve"].includes(action))) stop("OPERATOR_ACTION_REJECTED");
  const target = await deps.verifyTarget(), identity = await deps.identity();
  if (target.workspaceId !== a.workspaceId || target.resourceId !== a.resourceId || target.hostname !== a.hostname ||
      target.databaseName !== a.databaseName || target.databaseUser !== a.databaseUser || target.status !== "available" ||
      identity.Account !== OPERATOR_ACCOUNT || identity.Arn !== a.operatorArn) stop("OPERATOR_TARGET_REJECTED");
  if (deps.journal.scope !== a.scope || deps.service.recovery !== deps.journal || deps.service.db !== deps.db ||
      deps.service.hash("key-check") !== createHmac("sha256", deps.digestKey).update("privacy-v1:key-check").digest("hex") ||
      deps.journal.evidenceDigest("key-check") !== new PrivacyRecoveryJournal(deps.journal.store, a.scope, deps.digestKey).evidenceDigest("key-check"))
    stop("OPERATOR_CONFIGURATION_MISMATCH");
  return deps.db.$transaction(async tx => {
    // Fresh snapshots after lock acquisition avoid accepting a pre-lock snapshot
    // when another transaction committed while this operator waited for locks.
    await tx.$executeRawUnsafe(writes ? "SET TRANSACTION ISOLATION LEVEL READ COMMITTED" : "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout='15s'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(2601022)`;
    if (writes) {
      const tables = await tx.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
      if (!tables.length || tables.length > 200 || tables.some(t => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.tablename))) stop("OPERATOR_SCHEMA_REQUIRED");
      await tx.$executeRawUnsafe(`LOCK TABLE ${tables.map(t => `"${t.tablename}"`).join(',')} IN ACCESS EXCLUSIVE MODE`);
    }
    await validateDatabase(tx, a);
    validateOperatorApproval(a, deps.databaseUrl, deps.sourceRevision, now());
    const databaseDigest = await operatorDatabaseDigest(tx, deps.journal);
    let head: RecoveryHead, outcome: "COMMITTED" | "NOT_COMMITTED" | undefined, evidenceDigest: string | undefined;
    let result: any = {};
    if (a.operation === "enrollment") {
      if ((await privacyBaseline(tx)).some(r => r.count !== 0)) stop("OPERATOR_NONEMPTY_BASELINE");
      const versions = await deps.versions(), state = await deps.journal.store.read();
      if (versions.length || state.entries.length) {
        const verified = await deps.journal.ready();
        if (versions.length !== 1 || versions[0].marker || !versions[0].latest || versions[0].key !== `${a.prefix}0000000000000001.json` ||
            verified.head.sequence !== 1 || verified.checkpoint || verified.cases.size) stop("OPERATOR_CONFLICTING_ENROLLMENT");
        return { result: "ENROLLMENT_ALREADY_RECORDED", pins: pins(a, verified.enrollmentHash), writes: 0, trafficMayReopen: false };
      }
      head = state.head;
    } else if (a.operation === "resolve") {
      const observed = await outcomeEvidence(tx, deps.journal);
      if (observed.history.enrollmentHash !== a.enrollmentHash) stop("OPERATOR_ENROLLMENT_PIN_MISMATCH");
      if (!observed.history.pending) return { result: "NO_UNFINISHED_OPERATION", writes: 0, trafficMayReopen: false };
      head = observed.history.head; outcome = observed.outcome; evidenceDigest = observed.evidenceDigest;
    } else {
      const history = await deps.journal.ready();
      if (history.enrollmentHash !== a.enrollmentHash) stop("OPERATOR_ENROLLMENT_PIN_MISMATCH");
      head = history.head;
      result = await reconcileRecoveryTransaction(deps.service, tx, deps.digestKey, true);
    }
    const authorizationDigest = deps.journal.evidenceDigest(a);
    const unsigned = { format: 1 as const, operation: a.operation, authorizationDigest, databaseDigest, journalHead: head,
      issuedAt: new Date(now()).toISOString(), expiresAt: a.expiresAt, ...(outcome ? { outcome, evidenceDigest } : {}) };
    const plan = { ...unsigned, planDigest: deps.journal.evidenceDigest(unsigned) };
    if (!writes) return { result: "REVIEW_PLAN", plan, ...result, writes: 0, trafficMayReopen: false };
    if (!suppliedPlan) stop("OPERATOR_REVIEWED_PLAN_REQUIRED");
    const { planDigest, ...prior } = suppliedPlan;
    if (planDigest !== deps.journal.evidenceDigest(prior) || prior.format !== 1 || prior.operation !== a.operation ||
        prior.authorizationDigest !== authorizationDigest || prior.databaseDigest !== databaseDigest ||
        canonical(prior.journalHead) !== canonical(head) || prior.expiresAt !== a.expiresAt ||
        Date.parse(prior.issuedAt) > now() || Date.parse(prior.expiresAt) <= now() ||
        prior.outcome !== outcome || prior.evidenceDigest !== evidenceDigest) stop("OPERATOR_STALE_PLAN");
    if (action === "enroll") {
      let uncertain = false;
      try { await deps.journal.enrollEmptyDatabase(tx as any); } catch { uncertain = true; }
      let verified;
      try { verified = await deps.journal.ready(); } catch { stop("RECOVERY_WRITE_UNCERTAIN"); }
      if (verified.head.sequence !== 1 || verified.checkpoint || verified.cases.size) stop("OPERATOR_CONFLICTING_ENROLLMENT");
      const versions = await deps.versions();
      if (versions.length !== 1 || versions[0].marker || !versions[0].latest || versions[0].key !== `${a.prefix}0000000000000001.json`)
        stop("OPERATOR_CONFLICTING_ENROLLMENT");
      return { result: uncertain ? "ENROLLMENT_ACKNOWLEDGEMENT_RECOVERED" : "ENROLLMENT_RECORDED",
        pins: pins(a, verified.enrollmentHash), writes: 1, trafficMayReopen: false };
    }
    if (action === "resolve") {
      await deps.journal.resolvePending(head, outcome!, evidenceDigest!, deps.journal.evidenceDigest({
        authorizationDigest, planDigest, evidenceReference: a.outcomeEvidenceReference }));
      await deps.journal.ready();
      return { result: "OPERATION_RESOLVED", outcome, writes: 1, trafficMayReopen: false };
    }
    result = await reconcileRecoveryTransaction(deps.service, tx, deps.digestKey);
    return { result: "DATABASE_RECONCILED", ...result, trafficMayReopen: false };
  }, { timeout: 15000, maxWait: 2000 });
}
function pins(a: OperatorApproval, hash: string) {
  return { PRIVACY_RECOVERY_S3_BUCKET: a.bucket, PRIVACY_RECOVERY_S3_EXPECTED_OWNER: a.ownerAccountId,
    PRIVACY_RECOVERY_S3_REGION: a.region, PRIVACY_RECOVERY_S3_PREFIX: a.prefix, PRIVACY_RECOVERY_SCOPE: a.scope,
    PRIVACY_RECOVERY_ENROLLMENT_HASH: hash };
}
