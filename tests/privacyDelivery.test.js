process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/unused';
process.env.JWT_SECRET = 'synthetic-privacy-test-key';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { privacyVerificationDelivery } = require('../dist/services/privacyDelivery.service');
const { privacyAdminOnly, privacyEnabledOnly } = require('../dist/routes/privacy.routes');

const config = overrides => ({
  resendApiKey: 'synthetic-not-a-key', resendFrom: 'privacy@example.invalid', emailEnabled: true,
  twilioAccountSid: 'ACsynthetic', twilioAuthToken: 'synthetic-not-a-secret',
  twilioVerifyServiceSid: 'VAsynthetic', phoneEnabled: true, ...overrides
});

test('email verification is mocked, idempotent, bounded and disabled unless configured', async () => {
  let call;
  const delivery = privacyVerificationDelivery(config(), async (url, options) => {
    call = { url, options }; return new Response(JSON.stringify({ id: 'synthetic-resend-id' }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  });
  const started = await delivery.start({ channel: 'EMAIL', to: 'stored@example.invalid', code: '12345678', id: 'synthetic' });
  assert.equal(started.reference, 'synthetic-resend-id');
  assert.deepEqual(JSON.parse(call.options.body).to, ['stored@example.invalid']);
  assert.equal(call.options.headers['Idempotency-Key'], 'privacy-synthetic');
  assert.ok(call.options.signal);
  assert.equal(await delivery.check({ channel: 'EMAIL', to: 'stored@example.invalid', code: '12345678' }), true);
  const disabled = privacyVerificationDelivery(config({ resendApiKey: '', resendFrom: '', emailEnabled: false }), () => { throw new Error('Must not send'); });
  await assert.rejects(disabled.start({ channel: 'EMAIL', to: 'a@example.invalid', code: '12345678', id: 'a' }));
});

test('email verification rejects provider errors, malformed success and ambiguous transport without retry', async () => {
  const cases = [
    { name: 'rejected', response: new Response(JSON.stringify({ code: 422 }), { status: 422 }) },
    { name: 'invalid_response', response: new Response('{}', { status: 200 }) },
  ];
  for (const value of cases) {
    const diagnostics = []; let calls = 0;
    const delivery = privacyVerificationDelivery(config(), async () => { calls += 1; return value.response; },
      diagnostic => diagnostics.push(diagnostic));
    await assert.rejects(delivery.start({ channel: 'EMAIL', to: 'stored@example.invalid', code: '12345678', id: value.name }));
    assert.equal(calls, 1);
    assert.equal(diagnostics[0].provider, 'resend');
    assert.equal(diagnostics[0].outcome, value.name);
  }
  const diagnostics = []; let calls = 0;
  const delivery = privacyVerificationDelivery(config(), async () => {
    calls += 1; const error = new Error('private network detail'); error.name = 'TimeoutError'; throw error;
  }, diagnostic => diagnostics.push(diagnostic));
  await assert.rejects(delivery.start({ channel: 'EMAIL', to: 'stored@example.invalid', code: '12345678', id: 'timeout' }));
  assert.equal(calls, 1);
  assert.deepEqual(diagnostics, [{ provider: 'resend', operation: 'start', outcome: 'timeout' }]);
  assert.doesNotMatch(JSON.stringify(diagnostics), /stored@example|private network/);
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

test('Twilio Verify diagnostics retain only safe status, numeric code and outcome', async () => {
  const diagnostics = [];
  const privateBody = JSON.stringify({ code: 20003, status: 401, message: 'private provider explanation', to: '+15195550100' });
  const delivery = privacyVerificationDelivery(config(), async () => new Response(privateBody, {
    status: 401, headers: { 'content-type': 'application/json' }
  }), value => diagnostics.push(value));
  await assert.rejects(delivery.start({ channel: 'PHONE', to: '+15195550100', code: '', id: 'safe' }));
  assert.deepEqual(diagnostics, [{
    provider: 'twilio', operation: 'start', outcome: 'rejected', httpStatus: 401, errorCode: 20003
  }]);
  assert.doesNotMatch(JSON.stringify(diagnostics), /private provider explanation|15195550100/);
});

test('Twilio Verify diagnostics distinguish timeout without exposing the thrown error', async () => {
  const diagnostics = [];
  const delivery = privacyVerificationDelivery(config(), async () => {
    const error = new Error('private timeout details'); error.name = 'TimeoutError'; throw error;
  }, value => diagnostics.push(value));
  await assert.rejects(delivery.start({ channel: 'PHONE', to: '+15195550100', code: '', id: 'safe' }));
  assert.deepEqual(diagnostics, [{ provider: 'twilio', operation: 'start', outcome: 'timeout' }]);
  assert.doesNotMatch(JSON.stringify(diagnostics), /private timeout details|15195550100/);
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

test('public privacy routes fail closed before service access when deletion is disabled', async () => {
  const previous = {
    deletion: process.env.PRIVACY_DELETION_ENABLED,
    fulfillment: process.env.PRIVACY_FULFILLMENT_ENABLED,
    email: process.env.PRIVACY_VERIFICATION_EMAIL_ENABLED,
    phone: process.env.PRIVACY_VERIFICATION_PHONE_ENABLED
  };
  process.env.PRIVACY_DELETION_ENABLED = 'false';
  process.env.PRIVACY_FULFILLMENT_ENABLED = 'false';
  process.env.PRIVACY_VERIFICATION_EMAIL_ENABLED = 'false';
  process.env.PRIVACY_VERIFICATION_PHONE_ENABLED = 'false';
  try {
    let status, body, next = false, cacheControl;
    privacyEnabledOnly(false)({}, {
      set(name, value) { if (name === 'Cache-Control') cacheControl = value; return this; },
      status(value) { status = value; return this; },
      json(value) { body = value; return this; }
    }, () => { next = true; });
    assert.equal(status, 503);
    assert.deepEqual(body, { code: 'PRIVACY_SERVICE_UNAVAILABLE' });
    assert.equal(cacheControl, 'no-store');
    assert.equal(next, false);
  } finally {
    for (const [key, value] of Object.entries({
      PRIVACY_DELETION_ENABLED: previous.deletion,
      PRIVACY_FULFILLMENT_ENABLED: previous.fulfillment,
      PRIVACY_VERIFICATION_EMAIL_ENABLED: previous.email,
      PRIVACY_VERIFICATION_PHONE_ENABLED: previous.phone
    })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
