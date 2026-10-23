process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/unused';
process.env.JWT_SECRET = 'synthetic-privacy-test-key';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { privacyVerificationDelivery } = require('../dist/services/privacyDelivery.service');
const { privacyAdminOnly } = require('../dist/routes/privacy.routes');

const config = overrides => ({
  resendApiKey: 'synthetic-not-a-key', resendFrom: 'privacy@example.invalid', emailEnabled: true,
  twilioAccountSid: 'ACsynthetic', twilioAuthToken: 'synthetic-not-a-secret',
  twilioVerifyServiceSid: 'VAsynthetic', phoneEnabled: true, ...overrides
});

test('email verification is mocked, idempotent, bounded and disabled unless configured', async () => {
  let call;
  const delivery = privacyVerificationDelivery(config(), async (url, options) => {
    call = { url, options }; return { ok: true };
  });
  await delivery.start({ channel: 'EMAIL', to: 'stored@example.invalid', code: '12345678', id: 'synthetic' });
  assert.deepEqual(JSON.parse(call.options.body).to, ['stored@example.invalid']);
  assert.equal(call.options.headers['Idempotency-Key'], 'privacy-synthetic');
  assert.ok(call.options.signal);
  assert.equal(await delivery.check({ channel: 'EMAIL', to: 'stored@example.invalid', code: '12345678' }), true);
  const disabled = privacyVerificationDelivery(config({ resendApiKey: '', resendFrom: '', emailEnabled: false }), () => { throw new Error('Must not send'); });
  await assert.rejects(disabled.start({ channel: 'EMAIL', to: 'a@example.invalid', code: '12345678', id: 'a' }));
});

test('Twilio Verify start/check use managed codes and never place credentials in the URL or body', async () => {
  const calls = [];
  const delivery = privacyVerificationDelivery(config(), async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/Verifications')) return { ok: true, json: async () => ({ sid: 'VEsynthetic', status: 'pending' }) };
    return { ok: true, json: async () => ({ status: 'approved' }) };
  });
  const started = await delivery.start({ channel: 'PHONE', to: '+15195550100', code: 'not-sent-by-us', id: 'synthetic' });
  assert.equal(started.reference, 'VEsynthetic');
  assert.equal(new URLSearchParams(calls[0].options.body).get('To'), '+15195550100');
  assert.equal(new URLSearchParams(calls[0].options.body).get('Channel'), 'sms');
  assert.equal(calls[0].url.includes('synthetic-not-a-secret'), false);
  assert.equal(String(calls[0].options.body).includes('synthetic-not-a-secret'), false);
  assert.equal(await delivery.check({ channel: 'PHONE', to: '+15195550100', code: '123456', reference: started.reference }), true);
  assert.equal(new URLSearchParams(calls[1].options.body).get('Code'), '123456');
});

test('Twilio Verify rejects disabled, malformed and unapproved provider responses', async () => {
  const disabled = privacyVerificationDelivery(config({ phoneEnabled: false }), () => { throw new Error('Must not send'); });
  await assert.rejects(disabled.start({ channel: 'PHONE', to: '+15195550100', code: '', id: 'a' }));
  const malformed = privacyVerificationDelivery(config(), async () => ({ ok: true, json: async () => ({ status: 'pending' }) }));
  await assert.rejects(malformed.start({ channel: 'PHONE', to: '+15195550100', code: '', id: 'b' }));
  const denied = privacyVerificationDelivery(config(), async url => url.endsWith('/Verifications')
    ? { ok: true, json: async () => ({ sid: 'VEsynthetic', status: 'pending' }) }
    : { ok: true, json: async () => ({ status: 'pending' }) });
  assert.equal(await denied.check({ channel: 'PHONE', to: '+15195550100', code: '000000', reference: 'VEsynthetic' }), false);
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
