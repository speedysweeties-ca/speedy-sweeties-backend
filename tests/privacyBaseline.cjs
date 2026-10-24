const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const BASELINE_COMMIT = '12b78cc4780c96efa286c167c63ac1676dfc5dbb';
const PRIVACY_MIGRATIONS = [
  '20261023030000_customer_privacy_requests',
  '20261023150000_privacy_access_credentials',
  '20261023190000_adopt_retention_policy',
  '20261023220000_approved_privacy_review_dates',
];

function materializePinnedBaselineSchema() {
  const baseline = execFileSync(
    'git',
    ['show', `${BASELINE_COMMIT}:prisma/schema.prisma`],
    { encoding: 'utf8' },
  );
  assert.match(baseline, /model DigitalReceipt\s*\{/);
  assert.doesNotMatch(baseline, /model PrivacyDeletionRequest\s*\{/);

  const directory = mkdtempSync(join(tmpdir(), 'privacy-baseline-'));
  const path = join(directory, 'schema.prisma');
  writeFileSync(path, baseline, { mode: 0o600 });
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
