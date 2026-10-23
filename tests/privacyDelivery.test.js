process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/unused';
process.env.JWT_SECRET = 'synthetic-privacy-test-key';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resendPrivacyDelivery } = require('../dist/services/privacyDelivery.service');
const { privacyAdminOnly } = require('../dist/routes/privacy.routes');
test('verification delivery is mocked, idempotent, bounded and disabled unless explicitly enabled', async () => {
  let call;
  const send = resendPrivacyDelivery({ apiKey: 'synthetic-not-a-key', from: 'privacy@example.invalid', enabled: true }, async (url, options) => { call = { url, options }; return { ok: true }; });
  await send({ to: 'stored@example.invalid', code: '12345678', id: 'synthetic' });
  assert.deepEqual(JSON.parse(call.options.body).to, ['stored@example.invalid']);
  assert.equal(call.options.headers['Idempotency-Key'], 'privacy-synthetic');
  assert.ok(call.options.signal);
  const disabled = resendPrivacyDelivery({ apiKey: '', from: '', enabled: false }, () => { throw new Error('Must not send'); });
  await assert.rejects(disabled({ to: 'a@example.invalid', code: '12345678', id: 'a' }));
});
test('privacy administrator requires both current ADMIN role and explicit staff allowlist', () => {
  process.env.PRIVACY_ADMIN_USER_IDS = 'approved-synthetic-admin';
  for (const user of [undefined, { userId: 'approved-synthetic-admin', role: 'DISPATCHER' }, { userId: 'other', role: 'ADMIN' }]) {
    let code, next = false;
    privacyAdminOnly({ user }, { status(c) { code = c; return this; }, json() {} }, () => { next = true; });
    assert.equal(code, 403); assert.equal(next, false);
  }
  let next = false; privacyAdminOnly({ user: { userId: 'approved-synthetic-admin', role: 'ADMIN' } }, {}, () => { next = true; }); assert.equal(next, true);
  delete process.env.PRIVACY_ADMIN_USER_IDS;
});
