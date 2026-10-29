const assert = require('node:assert/strict');
const test = require('node:test');
const { verifyWebsiteToken, WebsiteVerificationError } = require('../dist/services/websiteVerification.service');
const { requireWebsiteVerification } = require('../dist/middleware/websiteVerification');
const { env } = require('../dist/config/env');
const valid = () => ({ success: true, hostname: 'www.speedysweeties.ca', action: 'website_order', challenge_ts: new Date().toISOString() });
const provider = result => async () => ({ ok: true, json: async () => result });

test('verification sends only token and secret to Siteverify and accepts a fresh matching challenge', async () => {
  await verifyWebsiteToken('synthetic-token', { secret: 'synthetic-secret', fetchImplementation: async (url, options) => {
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.deepEqual([...options.body], [['secret', 'synthetic-secret'], ['response', 'synthetic-token']]);
    assert.equal(options.method, 'POST');
    assert.ok(options.signal);
    return { ok: true, json: async () => valid() };
  } });
});

test('missing, oversized and non-string tokens never reach the provider', async () => {
  for (const token of [undefined, null, '', ' ', {}, 'a'.repeat(2049)]) {
    await assert.rejects(verifyWebsiteToken(token, { secret: 'synthetic', fetchImplementation: () => assert.fail('Unexpected network') }),
      error => error instanceof WebsiteVerificationError && !error.unavailable);
  }
});

test('rejects failed, replayed, expired, wrong-host and wrong-action responses', async () => {
  for (const change of [
    { success: false, 'error-codes': ['timeout-or-duplicate'] },
    { hostname: 'speedy-sweeties.webflow.io' }, { hostname: 'speedysweeties.ca' },
    { hostname: 'www.speedysweeties.ca.evil.invalid' }, { action: 'other' },
    { challenge_ts: new Date(Date.now() - 301000).toISOString() },
    { challenge_ts: new Date(Date.now() + 60000).toISOString() }, { challenge_ts: 'invalid' }
  ]) {
    await assert.rejects(verifyWebsiteToken('synthetic', { secret: 'synthetic', fetchImplementation: provider({ ...valid(), ...change }) }),
      error => error instanceof WebsiteVerificationError && !error.unavailable);
  }
});

test('provider outages and configuration errors fail closed without disclosing secrets', async () => {
  for (const fetchImplementation of [
    async () => { throw new Error('synthetic-secret'); },
    async () => ({ ok: false }), provider(null), provider({}),
    provider({ success: false, 'error-codes': ['invalid-input-secret'] })
  ]) {
    await assert.rejects(verifyWebsiteToken('synthetic', { secret: 'synthetic-secret', fetchImplementation }),
      error => error.unavailable && !error.message.includes('synthetic-secret'));
  }
});

test('website middleware cannot be bypassed by claiming a mobile source; native flow stays unchanged', async t => {
  const original = env.WEBSITE_TURNSTILE_REQUIRED;
  env.WEBSITE_TURNSTILE_REQUIRED = true;
  t.after(() => { env.WEBSITE_TURNSTILE_REQUIRED = original; });
  for (const source of [undefined, 'UNKNOWN', 'WEBFLOW', 'IOS_APP', 'ANDROID_APP']) {
    let status, body, continued = false;
    const response = { set() {}, status(value) { status = value; return this; }, json(value) { body = value; } };
    await requireWebsiteVerification({ get: () => 'https://www.speedysweeties.ca', body: { orderSource: source } }, response,
      () => { continued = true; });
    assert.equal(continued, false); assert.equal(status, 400); assert.equal(body.code, 'HUMAN_VERIFICATION_REQUIRED');
  }
  for (const source of [undefined, 'IOS_APP', 'ANDROID_APP']) {
    let continued = false;
    await requireWebsiteVerification({ get: () => undefined, body: { orderSource: source } }, {}, () => { continued = true; });
    assert.equal(continued, true);
  }
});

test('real order route rejects missing verification before duplicate checks or order creation', async t => {
  const original = env.WEBSITE_TURNSTILE_REQUIRED;
  env.WEBSITE_TURNSTILE_REQUIRED = true;
  t.after(() => { env.WEBSITE_TURNSTILE_REQUIRED = original; });
  const app = require('../dist/app').default;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/v1/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://www.speedysweeties.ca' },
    body: JSON.stringify({ customerName: 'Synthetic Test', customerPhone: '5195550100', customerEmail: 'synthetic@example.invalid',
      addressLine1: '1 Example Street', city: 'Guelph', province: 'Ontario', items: [{ name: 'test', quantity: 1, unitPrice: 0, totalPrice: 0 }],
      subtotal: 0, deliveryFee: 0, tax: 0, tip: 0, discount: 0, total: 0, paymentMethod: 'CASH' })
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'HUMAN_VERIFICATION_REQUIRED');
  for (const origin of ['https://speedysweeties.ca', 'https://speedy-sweeties.webflow.io', 'https://speedy-sweeties-website.onrender.com']) {
    const denied = await fetch(base + '/api/v1/orders', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
    assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null);
  }
  for (const origin of ['https://www.speedysweeties.ca', 'https://speedy-dispatcher.onrender.com']) {
    const allowed = await fetch(base + '/api/v1/orders', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
    assert.equal(allowed.status, 204); assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
  }
  const tracking = await fetch(base + '/track/?embedded=1');
  assert.match(tracking.headers.get('content-security-policy'), /frame-ancestors 'self' https:\/\/www.speedysweeties.ca$/);
});
