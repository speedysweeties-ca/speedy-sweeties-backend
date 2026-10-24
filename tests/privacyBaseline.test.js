const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const {
  BASELINE_COMMIT,
  PRIVACY_MIGRATIONS,
  materializePinnedBaselineSchema,
} = require('./privacyBaseline.cjs');

test('privacy baseline is pinned before privacy models and includes receipt evidence', () => {
  const path = materializePinnedBaselineSchema();
  const schema = readFileSync(path, 'utf8');
  assert.equal(BASELINE_COMMIT, '12b78cc4780c96efa286c167c63ac1676dfc5dbb');
  assert.match(schema, /model DigitalReceipt\s*\{/);
  assert.doesNotMatch(schema, /model PrivacyDeletionRequest\s*\{/);
});

test('privacy migrations are applied in their reviewed order', () => {
  assert.deepEqual(PRIVACY_MIGRATIONS, [
    '20261023030000_customer_privacy_requests',
    '20261023150000_privacy_access_credentials',
    '20261023190000_adopt_retention_policy',
    '20261023220000_approved_privacy_review_dates',
  ]);
});
