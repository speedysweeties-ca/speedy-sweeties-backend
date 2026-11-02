const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/js/human-verification.js'), 'utf8');
function harness(live = true) {
  const { document, CustomEvent } = parseHTML('<html><head></head><body><div id="actions"></div></body></html>');
  let options, resets = 0;
  const window = { speedySite: { live, turnstileSiteKey: 'synthetic' }, turnstile: {
    render(_element, value) { options = value; return 'test-widget'; }, reset() { resets++; }
  } };
  vm.runInNewContext(source, { window, document, CustomEvent, Date, setTimeout, clearTimeout });
  window.speedyHumanVerification.mount(document.getElementById('actions'));
  return { window, document, options, api: window.speedyHumanVerification, resets: () => resets };
}
test('preview never loads a verification script or widget', () => {
  const h = harness(false);
  assert.equal(h.options, undefined); assert.equal(h.document.querySelector('script'), null);
  assert.equal(h.api.ready(), false);
});
test('visible widget uses correct action and clears tokens on expiry, errors and retry', () => {
  const h = harness();
  assert.equal(h.options.action, 'website_order'); assert.equal(h.options.appearance, 'always');
  assert.equal(h.api.getToken(), '');
  h.options.callback('synthetic-token'); assert.equal(h.api.getToken(), 'synthetic-token');
  h.options['expired-callback'](); assert.equal(h.api.ready(), false);
  h.options.callback('next-token'); h.options['error-callback'](); assert.equal(h.api.getToken(), '');
  assert.equal(h.document.querySelector('button').hidden, false);
  h.api.reset(); assert.equal(h.resets(), 1); assert.equal(h.api.ready(), false);
});
test('script failure fails closed and gives the customer a retry and phone fallback', () => {
  const { document, CustomEvent } = parseHTML('<html><head></head><body></body></html>');
  const window = { speedySite: { live: true, turnstileSiteKey: 'synthetic' } };
  vm.runInNewContext(source, { window, document, CustomEvent, Date, setTimeout: () => 1, clearTimeout() {} });
  window.speedyHumanVerification.mount(document.body);
  const script = document.querySelector('script');
  assert.match(script.src, /^https:\/\/challenges.cloudflare.com\/turnstile\/v0\/api.js/);
  script.onerror();
  assert.equal(window.speedyHumanVerification.getToken(), '');
  assert.match(document.body.textContent, /519-826-8097/);
  assert.equal(document.querySelector('button').hidden, false);
});
