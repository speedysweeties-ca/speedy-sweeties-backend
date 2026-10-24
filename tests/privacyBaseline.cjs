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
];

function materializePinnedBaselineSchema() {
  const path = join(__dirname, 'fixtures', 'privacyBaseline-12b78cc.prisma');
  const baseline = readFileSync(path, 'utf8');
  assert.match(baseline, /model DigitalReceipt\s*\{/);
  assert.doesNotMatch(baseline, /model PrivacyDeletionRequest\s*\{/);
  return path;
}

function applyPinnedBaselineAndPrivacyMigrations(baselinePath) {
  execFileSync(process.execPath, [
    'node_modules/prisma/build/index.js', 'db', 'push',
    '--schema', baselinePath,
    '--skip-generate',
  ], { stdio: 'inherit' });

  for (const migration of PRIVACY_MIGRATIONS) {
    execFileSync(process.execPath, [
      'node_modules/prisma/build/index.js', 'db', 'execute',
      '--schema', 'prisma/schema.prisma',
      '--file', `prisma/migrations/${migration}/migration.sql`,
    ], { stdio: 'inherit' });
  }
}

module.exports = {
  BASELINE_COMMIT,
  PRIVACY_MIGRATIONS,
  materializePinnedBaselineSchema,
  applyPinnedBaselineAndPrivacyMigrations,
};
