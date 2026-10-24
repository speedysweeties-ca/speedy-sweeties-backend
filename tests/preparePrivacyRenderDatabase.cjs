// Apply migrations only to the explicitly named disposable Render database.
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const {
  materializePinnedBaselineSchema,
  applyPinnedBaselineAndPrivacyMigrations,
} = require('./privacyBaseline.cjs');

const CUSTOMER_DATA_TABLES = [
  'User',
  'StaffSessionEvent',
  'DispatcherNote',
  'DispatcherNoteRead',
  'Customer',
  'RetentionMessage',
  'Order',
  'DeliveryHelpRequest',
  'DeliveryCheckInEvent',
  'DispatchEvent',
  'OrderItem',
  'DigitalReceipt',
  'QrScan',
  'DispatcherChecklistCompletion',
  'DispatcherChecklistAlertLog',
  'BndEmailAlert',
  'BndMonitorCheck',
  'BndWaitingPeriod',
  'OrderPickupStop',
  'OrderEditPause',
  'PrivacyChallenge',
  'PrivacyDeletionRequest',
  'PrivacyAccessCredential',
  'PrivacyAudit',
  'PrivacyExternalTask',
  'PrivacyDeletedIdentity',
];

const REQUIRED_TABLES = [
  'StaffSessionEvent',
  'User',
  'DispatcherNote',
  'DispatcherNoteRead',
  'Customer',
  'RetentionMessage',
  'ItemCatalog',
  'Order',
  'DigitalReceipt',
  'PrivacyChallenge',
  'PrivacyDeletionRequest',
  'PrivacyAccessCredential',
  'PrivacyAudit',
  'PrivacyExternalTask',
  'PrivacyDeletedIdentity',
  'DeliveryHelpRequest',
  'DeliveryCheckInEvent',
  'DispatchEvent',
  'OrderItem',
  'QrScan',
  'DispatcherChecklistItem',
  'DispatcherChecklistCompletion',
  'DispatcherChecklistAlertLog',
  'BndEmailAlert',
  'BndMonitorCheck',
  'BndWaitingPeriod',
  'SystemSetting',
  'PickupLocation',
  'OrderPickupStop',
  'OrderEditPause',
];

const REQUIRED_COLUMNS = [
  'DigitalReceipt.retainedChargeEvidence',
  'PrivacyChallenge.sourceOrderId',
  'PrivacyChallenge.completionTimeframe',
  'PrivacyDeletionRequest.dueAt',
  'PrivacyDeletionRequest.closedAt',
  'PrivacyDeletionRequest.requestAuditReviewAt',
  'PrivacyExternalTask.retainUntil',
  'PrivacyExternalTask.reviewedAt',
];

const REQUIRED_TRIGGERS = [
  'privacy_retained_order_guard',
  'privacy_receipt_guard',
  'privacy_item_guard',
  'privacy_help_guard',
];

assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.env.PRIVACY_SYNTHETIC_DATABASE, 'yes');
assert.equal(process.env.PRIVACY_ISOLATED_RENDER, 'yes');
const url = new URL(process.env.DATABASE_URL);
assert.equal(decodeURIComponent(url.pathname), '/speedy_privacy_synthetic');
assert.notEqual(url.hostname, 'localhost');
assert.notEqual(url.hostname, '127.0.0.1');
assert.equal(process.env.PRIVACY_EXPECTED_DATABASE_HOST, url.hostname);

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function inspectSchema(prisma) {
  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const columns = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const triggers = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT trigger_name
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
  `);

  const tableSet = new Set(tables.map((row) => row.table_name));
  const columnSet = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));
  const triggerSet = new Set(triggers.map((row) => row.trigger_name));
  const missing = [
    ...REQUIRED_TABLES.filter((name) => !tableSet.has(name)).map((name) => `table:${name}`),
    ...REQUIRED_COLUMNS.filter((name) => !columnSet.has(name)).map((name) => `column:${name}`),
    ...REQUIRED_TRIGGERS.filter((name) => !triggerSet.has(name)).map((name) => `trigger:${name}`),
  ];

  return { complete: missing.length === 0, missing, tableSet };
}

async function assertNoCustomerData(prisma, existingTables) {
  const counts = [];
  for (const table of CUSTOMER_DATA_TABLES) {
    if (!existingTables.has(table)) continue;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)}`,
    );
    counts.push({ table, count: rows[0].count });
  }

  const nonempty = counts.filter(({ count }) => count !== 0);
  assert.deepEqual(
    nonempty,
    [],
    `Synthetic recovery refused: customer-bearing tables are not empty: ${nonempty
      .map(({ table, count }) => `${table}=${count}`)
      .join(', ')}`,
  );
  console.log(`[privacy-isolated] verified zero rows in ${counts.length} customer-bearing tables`);
}

async function prepare() {
  // Confirm the pinned baseline is available before any destructive operation.
  const baselinePath = materializePinnedBaselineSchema();
  let prisma = new PrismaClient();

  try {
    const identity = await prisma.$queryRawUnsafe(
      'SELECT current_database() AS database_name, current_schema() AS schema_name',
    );
    assert.equal(identity[0].database_name, 'speedy_privacy_synthetic');
    assert.equal(identity[0].schema_name, 'public');
    console.log('[privacy-isolated] verified database identity speedy_privacy_synthetic/public');

    const before = await inspectSchema(prisma);
    if (before.complete) {
      console.log('[privacy-isolated] verified complete privacy baseline; no recovery required');
      return;
    }

    await assertNoCustomerData(prisma, before.tableSet);

    const failedMigrations = before.tableSet.has('_prisma_migrations')
      ? await prisma.$queryRawUnsafe(`
          SELECT migration_name
          FROM "_prisma_migrations"
          WHERE finished_at IS NULL AND rolled_back_at IS NULL
          ORDER BY started_at
        `)
      : [];
    console.log(
      `[privacy-isolated] rebuilding incomplete disposable schema; failed migrations: ${
        failedMigrations.map((row) => row.migration_name).join(', ') || 'none'
      }`,
    );

    // Remove the failed migration record with the disposable schema itself. We
    // deliberately do not mark an incomplete migration as successfully applied.
    await prisma.$executeRawUnsafe('DROP SCHEMA "public" CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA "public"');
  } finally {
    await prisma.$disconnect();
  }

  applyPinnedBaselineAndPrivacyMigrations(baselinePath);

  prisma = new PrismaClient();
  try {
    const after = await inspectSchema(prisma);
    assert.deepEqual(after.missing, [], `Incomplete privacy baseline: ${after.missing.join(', ')}`);
    await assertNoCustomerData(prisma, after.tableSet);
    console.log('[privacy-isolated] complete privacy baseline verified');
  } finally {
    await prisma.$disconnect();
  }
}

prepare().catch((error) => {
  console.error('[privacy-isolated] database preparation failed:', error.message);
  process.exitCode = 1;
});
