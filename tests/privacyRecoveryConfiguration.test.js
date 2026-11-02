process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://privacy_test:synthetic-only@127.0.0.1:5432/speedy_privacy_synthetic';
process.env.JWT_SECRET = 'synthetic-config-jwt';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { productionRecoveryConfiguration, configuredPrivacyRecovery } = require('../dist/services/privacyRecoveryConfiguration');
const base = { PRIVACY_RECOVERY_S3_BUCKET: 'speedy-sweeties-privacy-decisions-080413009273', PRIVACY_RECOVERY_S3_EXPECTED_OWNER: '080413009273',
  PRIVACY_RECOVERY_S3_REGION: 'ca-central-1', PRIVACY_RECOVERY_S3_PREFIX: 'production/epoch-0001/',
  PRIVACY_RECOVERY_SCOPE: 'speedy-privacy-production-epoch-0001', PRIVACY_RECOVERY_ENROLLMENT_HASH: 'a'.repeat(64) };
test('production pins reject missing/mismatched resource, region, scope and enrollment without credential discovery', () => {
  assert.equal(productionRecoveryConfiguration(base).mode, 'active');
  for (const name of Object.keys(base)) {
    assert.throws(() => productionRecoveryConfiguration({ ...base, [name]: undefined }), /CONFIGURATION_REQUIRED/);
    assert.throws(() => productionRecoveryConfiguration({ ...base, [name]: 'unreviewed-value' }), /CONFIGURATION_REQUIRED/);
  }
  assert.throws(() => configuredPrivacyRecovery(base), /DEDICATED_CREDENTIALS_REQUIRED/);
  const e = { ...base, PRIVACY_DIGEST_KEY: 'synthetic-dedicated-digest-key-at-least-32', JWT_SECRET: 'synthetic-other-jwt',
    AWS_ACCESS_KEY_ID: 'synthetic-only-access-key', AWS_SECRET_ACCESS_KEY: 'synthetic-only-secret' };
  assert.equal(configuredPrivacyRecovery(e).scope, base.PRIVACY_RECOVERY_SCOPE);
  for (const flag of ['AWS_SESSION_TOKEN', 'AWS_ROLE_ARN', 'AWS_WEB_IDENTITY_TOKEN_FILE'])
    assert.throws(() => configuredPrivacyRecovery({ ...e, [flag]: 'conflicting-provider' }), /DEDICATED_CREDENTIALS_REQUIRED/);
  assert.throws(() => configuredPrivacyRecovery({ ...e, JWT_SECRET: e.PRIVACY_DIGEST_KEY }), /DEDICATED_CREDENTIALS_REQUIRED/);
});
test('gates-off startup/router keeps ordinary traffic available without any recovery configuration or AWS call', async () => {
  const { privacyRouter } = require('../dist/routes/privacy.routes');
  const old = process.env.PRIVACY_DELETION_ENABLED; process.env.PRIVACY_DELETION_ENABLED = 'false';
  const app = express(); app.get('/ordinary-read', (_req, res) => res.json({ available: true }));
  app.use('/privacy', privacyRouter());
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(origin + '/ordinary-read')).status, 200);
    const disabled = await fetch(origin + '/privacy/requests/00000000-0000-4000-8000-000000000000');
    assert.equal(disabled.status, 503); assert.equal((await disabled.json()).code, 'PRIVACY_SERVICE_UNAVAILABLE');
  } finally { await new Promise(r => server.close(r)); if (old === undefined) delete process.env.PRIVACY_DELETION_ENABLED; else process.env.PRIVACY_DELETION_ENABLED = old; }
});
