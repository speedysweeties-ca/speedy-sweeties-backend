// Destructive schema setup is limited to a named, loopback synthetic database.
const assert = require('node:assert/strict');
const {
  materializePinnedBaselineSchema,
  applyPinnedBaselineAndPrivacyMigrations,
} = require('./privacyBaseline.cjs');
assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.env.PRIVACY_SYNTHETIC_DATABASE, 'yes');
const url = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.equal(url.pathname, '/speedy_privacy_synthetic');
// The pre-feature schema is pinned, not derived from a possibly advancing main.
const path = materializePinnedBaselineSchema();
applyPinnedBaselineAndPrivacyMigrations(path);
