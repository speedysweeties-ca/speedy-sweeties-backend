'use strict';

const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { REQUIRED_STARTUP_TABLES } = require('./privacyIsolatedEmailSupport.cjs');
const { PRIVACY_MIGRATIONS } = require('./privacyBaseline.cjs');

const BACKEND_ROOT = join(__dirname, '..');
const COMPLETED_PHONE_CLEANUP_GATE = 'completed-phone-fixture-v1';
const WRITER_EXCLUSION_CONFIRMATION = 'confirmed';
const CLEANUP_LOCK_KEY = '824631905771234011';
const EXPECTED_TIMEFRAME =
  'Normally within 30 calendar days after verification; an ownership conflict or legal hold may require longer.';
const HEX_64 = /^[a-f0-9]{64}$/;
const TWILIO_VERIFICATION_SID = /^VE[a-f0-9]{32}$/i;

const REVIEWED_FILE_HASHES = Object.freeze({
  'prisma/schema.prisma': 'c8a30a02c43d1175219934cdc070dcb7be07d0513cf5d9f21c720874ca5c8ea9',
  'tests/fixtures/privacyBaseline-12b78cc.prisma': 'f30f7b7d21e1f19109f4f7ad9c69507050fe27339064db2115ca114a43a35091',
  'prisma/migrations/20261023030000_customer_privacy_requests/migration.sql':
    '1425fe3cb4d04149a58970a21e530448ced4d00a0f733c457495d30dbdf38be1',
  'prisma/migrations/20261023150000_privacy_access_credentials/migration.sql':
    'd8e890ac4f2e9b174afe1fd1eee714a09b7407f97fb46cf178412980710b758f',
  'prisma/migrations/20261023190000_adopt_retention_policy/migration.sql':
    'a3c26ab69a56feb2d017f5b3ffc9f2088768dcd063113e041a7fdd929bccb6c4',
  'prisma/migrations/20261023220000_approved_privacy_review_dates/migration.sql':
    'fa547902dfd3badf35d0dc90f744d96413c814b514f26ce3585ff340d05f6580',
  'prisma/migrations/20261030160000_retention_sms_delivery/migration.sql':
    '00d70a662ed93c389b8be80f7df29391e63265c947f9e27e895401a92377a22d',
});

const COMPLETED_PHONE_COUNTS = Object.freeze(Object.fromEntries(
  REQUIRED_STARTUP_TABLES.map(table => [table, ({
    Customer: 1,
    Order: 1,
    User: 1,
    PrivacyChallenge: 1,
    PrivacyAccessCredential: 1,
    PrivacyDeletionRequest: 1,
    PrivacyAudit: 2,
  })[table] || 0]),
));

const EXPECTED_TRIGGER_ROWS = Object.freeze([
  ['privacy_retained_order_guard', 'Order', 'BEFORE', 'ROW', 'DELETE', 'privacy_retained_order_guard'],
  ['privacy_retained_order_guard', 'Order', 'BEFORE', 'ROW', 'UPDATE', 'privacy_retained_order_guard'],
  ['privacy_receipt_guard', 'DigitalReceipt', 'BEFORE', 'ROW', 'DELETE', 'privacy_retained_child_guard'],
  ['privacy_receipt_guard', 'DigitalReceipt', 'BEFORE', 'ROW', 'INSERT', 'privacy_retained_child_guard'],
  ['privacy_receipt_guard', 'DigitalReceipt', 'BEFORE', 'ROW', 'UPDATE', 'privacy_retained_child_guard'],
  ['privacy_item_guard', 'OrderItem', 'BEFORE', 'ROW', 'DELETE', 'privacy_retained_child_guard'],
  ['privacy_item_guard', 'OrderItem', 'BEFORE', 'ROW', 'INSERT', 'privacy_retained_child_guard'],
  ['privacy_item_guard', 'OrderItem', 'BEFORE', 'ROW', 'UPDATE', 'privacy_retained_child_guard'],
  ['privacy_help_guard', 'DeliveryHelpRequest', 'BEFORE', 'ROW', 'INSERT', 'privacy_retained_child_guard'],
  ['privacy_help_guard', 'DeliveryHelpRequest', 'BEFORE', 'ROW', 'UPDATE', 'privacy_retained_child_guard'],
]);
const EXPECTED_TRIGGER_FUNCTION_BODIES = Object.freeze({
  privacy_retained_order_guard: `
    BEGIN
      IF OLD."privacyErasedAt" IS NOT NULL THEN
        RAISE EXCEPTION 'Retained privacy record is read only';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END
  `,
  privacy_retained_child_guard: `
    BEGIN
      IF TG_OP = 'DELETE' THEN
        PERFORM id FROM "Order" WHERE id = OLD."orderId" AND "privacyErasedAt" IS NULL FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Retained privacy record is read only'; END IF;
        RETURN OLD;
      END IF;
      PERFORM id FROM "Order" WHERE id = NEW."orderId" AND "privacyErasedAt" IS NULL FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Retained privacy record is read only'; END IF;
      RETURN NEW;
    END
  `,
});

function refuse(code) {
  const error = new Error(code);
  error.safeCode = code;
  throw error;
}

function requireSafe(condition, code) {
  if (!condition) refuse(code);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function reviewedSourceReport(root = BACKEND_ROOT) {
  const mismatches = [];
  for (const [file, expected] of Object.entries(REVIEWED_FILE_HASHES)) {
    let actual;
    try { actual = sha256(readFileSync(join(root, file))); }
    catch { refuse('REVIEWED_SOURCE_UNAVAILABLE'); }
    if (actual !== expected) mismatches.push(file);
  }
  return { reviewedFileCount: Object.keys(REVIEWED_FILE_HASHES).length, mismatches, pass: mismatches.length === 0 };
}

function expectedMigrationEvidence(root = BACKEND_ROOT) {
  return PRIVACY_MIGRATIONS.map(name => ({
    name,
    checksum: sha256(readFileSync(join(root, 'prisma', 'migrations', name, 'migration.sql'))),
  }));
}

function exactTableInventory(actualTables, { ledgerPresent }) {
  const expected = [...REQUIRED_STARTUP_TABLES, ...(ledgerPresent ? ['_prisma_migrations'] : [])].sort();
  const actual = [...actualTables].sort();
  const missing = expected.filter(table => !actual.includes(table));
  const unexpected = actual.filter(table => !expected.includes(table));
  return { expectedCount: expected.length, actualCount: actual.length, missing, unexpected,
    pass: missing.length === 0 && unexpected.length === 0 };
}

function validDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validateCompletedPhoneFixtureSnapshot(snapshot) {
  const countKeys = Object.keys(snapshot.counts || {}).sort();
  const inventory = exactTableInventory(countKeys, { ledgerPresent: false });
  requireSafe(inventory.pass, 'FIXTURE_TABLE_INVENTORY_MISMATCH');
  for (const table of REQUIRED_STARTUP_TABLES) {
    requireSafe(snapshot.counts[table] === COMPLETED_PHONE_COUNTS[table], `FIXTURE_COUNT_${table}`);
  }

  const exactly = (rows, count, code) => requireSafe(Array.isArray(rows) && rows.length === count, code);
  exactly(snapshot.customers, 1, 'FIXTURE_CUSTOMER_ROWS');
  exactly(snapshot.orders, 1, 'FIXTURE_ORDER_ROWS');
  exactly(snapshot.users, 1, 'FIXTURE_USER_ROWS');
  exactly(snapshot.challenges, 1, 'FIXTURE_CHALLENGE_ROWS');
  exactly(snapshot.accessCredentials, 1, 'FIXTURE_ACCESS_ROWS');
  exactly(snapshot.requests, 1, 'FIXTURE_REQUEST_ROWS');
  exactly(snapshot.audits, 2, 'FIXTURE_AUDIT_ROWS');

  const [customer] = snapshot.customers;
  const [order] = snapshot.orders;
  const [user] = snapshot.users;
  const [challenge] = snapshot.challenges;
  const [access] = snapshot.accessCredentials;
  const [request] = snapshot.requests;

  requireSafe(customer.fullName === 'Synthetic Isolated Customer', 'FIXTURE_CUSTOMER_MARKER');
  requireSafe(customer.normalizedFullName === 'synthetic isolated customer', 'FIXTURE_CUSTOMER_NORMALIZATION');
  requireSafe(customer.addressLine1 === '93 Synthetic Street' && customer.city === 'Guelph' && customer.province === 'ON',
    'FIXTURE_CUSTOMER_ADDRESS');
  requireSafe(customer.email === null && customer.normalizedEmail === null, 'FIXTURE_CUSTOMER_EMAIL');
  requireSafe(/^[2-9]\d{9}$/.test(customer.phone || '') && customer.normalizedPhone === customer.phone,
    'FIXTURE_CUSTOMER_PHONE');

  requireSafe(order.customerId === customer.id, 'FIXTURE_ORDER_CUSTOMER_LINK');
  requireSafe(order.customerName === customer.fullName && order.phone === customer.phone && order.email === '',
    'FIXTURE_ORDER_CONTACT');
  requireSafe(order.addressLine1 === customer.addressLine1 && order.itemsText === 'Synthetic isolated privacy fixture',
    'FIXTURE_ORDER_MARKER');
  requireSafe(order.paymentMethod === 'CASH' && order.orderSource === 'IOS_APP' && order.orderStatus === 'DELIVERED',
    'FIXTURE_ORDER_STATE');
  requireSafe(order.privacyErasedAt === null && HEX_64.test(order.trackingTokenHash || ''),
    'FIXTURE_ORDER_ERASURE');

  requireSafe(user.id === 'synthetic-isolated-admin' && user.email === 'privacy-isolated-admin@example.invalid' &&
    user.passwordHash === 'synthetic-not-a-login' && user.role === 'ADMIN' &&
    user.firstName === 'Synthetic' && user.lastName === 'Admin', 'FIXTURE_ADMIN_MARKER');

  requireSafe(challenge.subjectId === customer.id && challenge.sourceOrderId === order.id && challenge.accessId === access.id,
    'FIXTURE_CHALLENGE_LINK');
  requireSafe(challenge.purpose === 'ENROLL_DELETE' && challenge.channel === 'PHONE', 'FIXTURE_CHALLENGE_SCOPE');
  requireSafe(challenge.destinationHash === challenge.phoneHash && HEX_64.test(challenge.destinationHash || '') &&
    HEX_64.test(challenge.requesterHash || '') && HEX_64.test(challenge.codeHash || '') &&
    HEX_64.test(challenge.contactFingerprint || ''), 'FIXTURE_CHALLENGE_HASH_SHAPE');
  requireSafe(challenge.completionTimeframe === EXPECTED_TIMEFRAME && challenge.delivery === 'SENT' &&
    TWILIO_VERIFICATION_SID.test(challenge.providerReference || '') && challenge.attempts === 1 &&
    validDate(challenge.verifiedAt) && validDate(challenge.consumedAt), 'FIXTURE_CHALLENGE_COMPLETION');

  requireSafe(access.customerId === customer.id && access.sourceOrderId === order.id && access.channel === 'PHONE' &&
    access.destinationHash === challenge.destinationHash && access.revokedAt === null, 'FIXTURE_ACCESS_LINK');

  requireSafe(request.subjectId === customer.id && request.sourceOrderId === order.id &&
    request.challengeId === challenge.id && request.activeSubject === null, 'FIXTURE_REQUEST_LINK');
  requireSafe(request.status === 'CANCELLED' && request.version === 1 &&
    request.contactFingerprint === challenge.contactFingerprint &&
    request.completionTimeframe === challenge.completionTimeframe, 'FIXTURE_REQUEST_STATE');
  requireSafe(request.databaseErasedAt === null && request.completedAt === null && validDate(request.closedAt),
    'FIXTURE_REQUEST_ERASURE');
  requireSafe(validDate(request.createdAt) && validDate(request.dueAt) && validDate(request.requestAuditReviewAt),
    'FIXTURE_REQUEST_DATES');
  const dueDelta = request.dueAt.getTime() - request.createdAt.getTime();
  requireSafe(dueDelta >= 29 * 86400000 && dueDelta <= 31 * 86400000, 'FIXTURE_REQUEST_DUE_DATE');
  const expectedReview = new Date(request.closedAt.getTime());
  expectedReview.setUTCMonth(expectedReview.getUTCMonth() + 24);
  requireSafe(expectedReview.getTime() === request.requestAuditReviewAt.getTime(), 'FIXTURE_REQUEST_REVIEW_DATE');

  requireSafe(snapshot.audits.every(row => row.requestId === request.id), 'FIXTURE_AUDIT_LINK');
  const events = snapshot.audits.map(row => row.event).sort();
  requireSafe(events[0] === 'CANCELLED' && events[1] === 'SUBMITTED', 'FIXTURE_AUDIT_EVENTS');
  return { state: 'completed-phone-fixture-v1', pass: true };
}

async function publicBaseTables(prisma) {
  return (await prisma.$queryRawUnsafe(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name LIMIT 64
  `)).map(row => row.table_name);
}

const quoteIdentifier = identifier => `"${identifier.replaceAll('"', '""')}"`;

async function applicationCounts(prisma, tables = REQUIRED_STARTUP_TABLES) {
  const counts = {};
  for (const table of tables) {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)}`);
    counts[table] = Number(rows[0].count);
  }
  return counts;
}

async function inspectCompletedPhoneFixture(prisma) {
  const tables = await publicBaseTables(prisma);
  const inventory = exactTableInventory(tables, { ledgerPresent: false });
  requireSafe(inventory.pass, 'FIXTURE_TABLE_INVENTORY_MISMATCH');
  const counts = await applicationCounts(prisma);
  for (const table of REQUIRED_STARTUP_TABLES) {
    requireSafe(counts[table] === COMPLETED_PHONE_COUNTS[table], `FIXTURE_COUNT_${table}`);
  }
  const snapshot = {
    counts,
    customers: await prisma.customer.findMany({ take: 2 }),
    orders: await prisma.order.findMany({ take: 2 }),
    users: await prisma.user.findMany({ take: 2 }),
    challenges: await prisma.privacyChallenge.findMany({ take: 2 }),
    accessCredentials: await prisma.privacyAccessCredential.findMany({ take: 2 }),
    requests: await prisma.privacyDeletionRequest.findMany({ take: 2 }),
    audits: await prisma.privacyAudit.findMany({ take: 3 }),
  };
  return validateCompletedPhoneFixtureSnapshot(snapshot);
}

async function acquireWriterExclusion(prisma) {
  const lockRows = await prisma.$queryRawUnsafe(
    `SELECT pg_try_advisory_lock(${CLEANUP_LOCK_KEY}::bigint) AS acquired`,
  );
  requireSafe(lockRows[0]?.acquired === true, 'CLEANUP_LOCK_UNAVAILABLE');
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(${CLEANUP_LOCK_KEY}::bigint) AS released`);
  };
  try {
    const writers = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS count FROM pg_stat_activity
      WHERE datname = current_database() AND backend_type = 'client backend'
        AND pid <> pg_backend_pid()
        AND backend_xid IS NOT NULL
    `);
    requireSafe(Number(writers[0]?.count) === 0, 'OTHER_DATABASE_WRITERS_PRESENT');
    return release;
  } catch (error) {
    await release().catch(() => {});
    throw error;
  }
}

function triggerFunction(actionStatement) {
  return String(actionStatement || '').match(/^EXECUTE FUNCTION ([a-z_][a-z0-9_]*)\(\)$/i)?.[1] || null;
}

function triggerDefinitionReport(rows) {
  const encode = values => values.join('|');
  const expected = EXPECTED_TRIGGER_ROWS.map(encode).sort();
  const actual = rows.map(row => encode([
    row.trigger_name,
    row.event_object_table,
    row.action_timing,
    row.action_orientation,
    row.event_manipulation,
    triggerFunction(row.action_statement),
  ])).sort();
  const missing = expected.filter(value => !actual.includes(value));
  const unexpected = actual.filter(value => !expected.includes(value));
  return { expectedDefinitionRows: expected.length, actualDefinitionRows: actual.length,
    missingCount: missing.length, unexpectedCount: unexpected.length,
    pass: missing.length === 0 && unexpected.length === 0 };
}

const normalizeSqlBody = value => String(value || '').trim().replace(/\s+/g, ' ');

function triggerFunctionDefinitionReport(rows) {
  const expected = Object.entries(EXPECTED_TRIGGER_FUNCTION_BODIES).map(([name, body]) => ({
    name,
    language: 'plpgsql',
    arguments: '',
    resultType: 'trigger',
    volatility: 'v',
    securityDefiner: false,
    bodyDigest: sha256(normalizeSqlBody(body)),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const actual = rows.map(row => ({
    name: row.function_name,
    language: row.language_name,
    arguments: row.arguments,
    resultType: row.result_type,
    volatility: row.volatility,
    securityDefiner: row.security_definer,
    bodyDigest: sha256(normalizeSqlBody(row.source_body)),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const expectedEncoded = expected.map(JSON.stringify);
  const actualEncoded = actual.map(JSON.stringify);
  const missing = expectedEncoded.filter(value => !actualEncoded.includes(value));
  const unexpected = actualEncoded.filter(value => !expectedEncoded.includes(value));
  return { expectedFunctionCount: expected.length, actualFunctionCount: actual.length,
    missingCount: missing.length, unexpectedCount: unexpected.length,
    pass: missing.length === 0 && unexpected.length === 0 };
}

function migrationLedgerReport(rows, expected) {
  const expectedMap = new Map(expected.map(row => [row.name, row.checksum]));
  const names = rows.map(row => row.migration_name);
  const missing = expected.filter(row => !names.includes(row.name)).length;
  const unexpected = names.filter(name => !expectedMap.has(name)).length;
  const unfinished = rows.filter(row => !row.finished || row.rolled_back).length;
  const checksumMismatches = rows.filter(row =>
    expectedMap.has(row.migration_name) && expectedMap.get(row.migration_name) !== row.checksum).length;
  return { expectedCount: expected.length, actualCount: rows.length, missingCount: missing,
    unexpectedCount: unexpected, unfinishedCount: unfinished, checksumMismatchCount: checksumMismatches,
    pass: rows.length === expected.length && missing === 0 && unexpected === 0 &&
      unfinished === 0 && checksumMismatches === 0 };
}

function runPrismaSchemaDiff(execute = spawnSync) {
  const result = execute(process.execPath, [
    'node_modules/prisma/build/index.js', 'migrate', 'diff', '--exit-code',
    '--from-schema-datasource', 'prisma/schema.prisma',
    '--to-schema-datamodel', 'prisma/schema.prisma',
  ], {
    cwd: BACKEND_ROOT,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024,
  });
  if (result.status === 0) {
    const digest = sha256(`${result.stdout || ''}${result.stderr || ''}`);
    return { empty: true, outputDigest: digest, pass: true };
  }
  if (result.status === 2) refuse('SCHEMA_DIFF_NONEMPTY');
  refuse('SCHEMA_DIFF_UNAVAILABLE');
}

async function verifyEmptyCompatibleDatabase(prisma, executeSchemaDiff = spawnSync) {
  const source = reviewedSourceReport();
  requireSafe(source.pass, 'REVIEWED_SOURCE_MISMATCH');
  const tables = await publicBaseTables(prisma);
  const inventory = exactTableInventory(tables, { ledgerPresent: true });
  requireSafe(inventory.pass, 'POST_CLEANUP_TABLE_INVENTORY_MISMATCH');
  const counts = await applicationCounts(prisma);
  const nonempty = Object.values(counts).filter(count => count !== 0).length;
  requireSafe(nonempty === 0, 'POST_CLEANUP_APPLICATION_ROWS_PRESENT');
  const ledgerRows = await prisma.$queryRawUnsafe(`
    SELECT migration_name, checksum,
           finished_at IS NOT NULL AS finished,
           rolled_back_at IS NOT NULL AS rolled_back
    FROM "_prisma_migrations" ORDER BY migration_name LIMIT 32
  `);
  const ledger = migrationLedgerReport(ledgerRows, expectedMigrationEvidence());
  requireSafe(ledger.pass, 'POST_CLEANUP_MIGRATION_LEDGER_MISMATCH');
  const triggerRows = await prisma.$queryRawUnsafe(`
    SELECT trigger_name, event_object_table, action_timing, action_orientation,
           event_manipulation, action_statement
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY trigger_name, event_manipulation LIMIT 32
  `);
  const triggers = triggerDefinitionReport(triggerRows);
  requireSafe(triggers.pass, 'POST_CLEANUP_TRIGGER_MISMATCH');
  const triggerFunctionRows = await prisma.$queryRawUnsafe(`
    SELECT p.proname AS function_name, l.lanname AS language_name,
           pg_get_function_identity_arguments(p.oid) AS arguments,
           pg_get_function_result(p.oid) AS result_type,
           p.provolatile AS volatility, p.prosecdef AS security_definer,
           p.prosrc AS source_body
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND p.proname IN ('privacy_retained_order_guard', 'privacy_retained_child_guard')
    ORDER BY p.proname LIMIT 8
  `);
  const triggerFunctions = triggerFunctionDefinitionReport(triggerFunctionRows);
  requireSafe(triggerFunctions.pass, 'POST_CLEANUP_TRIGGER_FUNCTION_MISMATCH');
  const schemaDiff = runPrismaSchemaDiff(executeSchemaDiff);
  return {
    reviewedSource: source,
    tableInventory: inventory,
    applicationTableCount: REQUIRED_STARTUP_TABLES.length,
    nonemptyApplicationTableCount: nonempty,
    migrationLedger: ledger,
    triggerDefinitions: triggers,
    triggerFunctions,
    schemaDiff,
    pass: true,
  };
}

function singleConnectionUrl(value) {
  const url = new URL(value);
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('pool_timeout', '5');
  url.searchParams.set('connect_timeout', '10');
  url.searchParams.set('application_name', 'speedy-completed-phone-cleanup-v1');
  return url.toString();
}

module.exports = {
  COMPLETED_PHONE_CLEANUP_GATE,
  WRITER_EXCLUSION_CONFIRMATION,
  CLEANUP_LOCK_KEY,
  COMPLETED_PHONE_COUNTS,
  REVIEWED_FILE_HASHES,
  expectedMigrationEvidence,
  reviewedSourceReport,
  exactTableInventory,
  validateCompletedPhoneFixtureSnapshot,
  inspectCompletedPhoneFixture,
  acquireWriterExclusion,
  triggerDefinitionReport,
  triggerFunctionDefinitionReport,
  migrationLedgerReport,
  runPrismaSchemaDiff,
  verifyEmptyCompatibleDatabase,
  singleConnectionUrl,
};
