const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const BASELINE_COMMIT = '12b78cc4780c96efa286c167c63ac1676dfc5dbb';
const PRIVACY_MIGRATIONS = [
  '20261023030000_customer_privacy_requests',
  '20261023150000_privacy_access_credentials',
  '20261023190000_adopt_retention_policy',
  '20261023220000_approved_privacy_review_dates',
    '20261030160000_retention_sms_delivery',
];

function materializePinnedBaselineSchema() {
  const path = join(__dirname, 'fixtures', 'privacyBaseline-12b78cc.prisma');
  const baseline = readFileSync(path, 'utf8');
  assert.match(baseline, /model DigitalReceipt\s*\{/);
  assert.doesNotMatch(baseline, /model PrivacyDeletionRequest\s*\{/);
  return path;
}

function applyPinnedBaselineAndPrivacyMigrations(baselinePath, { recordExecutedSql = false, execute = execFileSync } = {}) {
  if (recordExecutedSql) {
    assert.equal(process.env.NODE_ENV, 'test'); assert.equal(process.env.PRIVACY_SYNTHETIC_DATABASE, 'yes');
    const url = new URL(process.env.DATABASE_URL);
    assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
    assert.equal(url.pathname, '/speedy_privacy_synthetic'); assert.equal(url.username, 'privacy_test');
    // Only a fresh synthetic setup may record its actual successful SQL. Never
    // resolve an existing failed/partial ledger or touch production/Render resets.
    execute(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'execute', '--schema', 'prisma/schema.prisma', '--stdin'], {
      input: `DO $$ BEGIN IF to_regclass('public._prisma_migrations') IS NOT NULL THEN RAISE EXCEPTION 'Synthetic ledger must be absent'; END IF; END $$;`,
      stdio: ['pipe', 'inherit', 'inherit']
    });
  }
  execute(process.execPath, [
    'node_modules/prisma/build/index.js', 'db', 'push',
    '--schema', baselinePath,
    '--skip-generate',
  ], { stdio: 'inherit' });

  for (const migration of PRIVACY_MIGRATIONS) {
    execute(process.execPath, [
      'node_modules/prisma/build/index.js', 'db', 'execute',
      '--schema', 'prisma/schema.prisma',
      '--file', `prisma/migrations/${migration}/migration.sql`,
    ], { stdio: 'inherit' });
    if (recordExecutedSql) execute(process.execPath, [
      'node_modules/prisma/build/index.js', 'migrate', 'resolve', '--applied', migration, '--schema', 'prisma/schema.prisma',
    ], { stdio: 'inherit' }); // Reached only after that exact SQL process succeeded.
  }
}

module.exports = {
  BASELINE_COMMIT,
  PRIVACY_MIGRATIONS,
  materializePinnedBaselineSchema,
  applyPinnedBaselineAndPrivacyMigrations,
};
