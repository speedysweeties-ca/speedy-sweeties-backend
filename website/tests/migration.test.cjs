const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { parseHTML } = require('linkedom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const source = name => fs.readFileSync(path.join(root, 'src/js', name), 'utf8');
const acknowledgement = {
  success: true,
  order: { id: '11111111-2222-4333-8444-555555555555', orderNumber: 42, orderStatus: 'PLACED' },
  trackingToken: 'a'.repeat(43)
};

function harness({ live = true, closed = false, order = acknowledgement, status = 200, failOrder = false } = {}) {
  const { document, CustomEvent, Event } = parseHTML(html);
  const calls = [];
  const window = { speedySite: { live }, location: { hostname: 'www.speedysweeties.ca' }, addEventListener() {},
    speedyAddress: { verify: async () => {}, matches: () => true } };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/business/status')) return { ok: true, json: async () => ({ success: true, source: 'google_places', isOpen: !closed }) };
    if (!url.endsWith('/orders')) throw Error('Unexpected request: ' + url);
    if (failOrder) throw Error('Connection lost after sending');
    return { ok: status >= 200 && status < 300, status, json: async () => order };
  };
  const context = vm.createContext({ window, document, fetch, AbortController, CustomEvent, console,
    setTimeout, clearTimeout, setInterval() {} });
  const form = document.getElementById('email-form');
  form.checkValidity = () => true;
  form.reportValidity = () => {};
  vm.runInContext(source('order-form.js'), context);
  document.dispatchEvent(new Event('DOMContentLoaded'));
  const fields = { 'Name-5': 'Synthetic Test', Address: '1 Example Street', 'Apartment-Unit-Number': '4B', 'Buzz-Code': '2468', City: 'Guelph',
    Email: 'synthetic@example.invalid', 'Confirm-Email': 'synthetic@example.invalid', Phone: '5195550100', Items: '2 x test item', 'Additional-Notes': '' };
  for (const [id, value] of Object.entries(fields)) document.getElementById(id).value = value;
  // LinkeDOM does not implement the native select.value setter.
  Object.defineProperty(document.getElementById('City'), 'value', { value: 'Guelph', writable: true });
  document.getElementById('Payment-Method---Cash').checked = true;
  return { document, calls, form, submit: () => form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const posts = h => h.calls.filter(call => call.options?.method === 'POST');

test('preview form sends no requests and never reports a received order', async () => {
  const h = harness({ live: false });
  h.submit(); await settle();
  assert.equal(h.calls.length, 0);
  assert.match(h.document.querySelector('.w-form-fail').textContent, /No order has been sent/);
  assert.notEqual(h.form.style.display, 'none');
});

test('matching form preserves API payload, access details and valid acknowledgement', async () => {
  const h = harness(); await settle(); h.submit(); await settle();
  assert.equal(posts(h).length, 1);
  const payload = JSON.parse(posts(h)[0].options.body);
  assert.equal(payload.unitNumber, '4B'); assert.equal(payload.buzzCode, '2468');
  assert.equal(payload.addressLine1, '1 Example Street');
  assert.equal(payload.paymentMethod, 'CASH');
  assert.equal(payload.items[0].quantity, 2);
  assert.equal(h.form.style.display, 'none');
  assert.match(h.document.querySelector('.w-form-done').textContent, /order #42 has been received/);
});

test('mismatched email prevents order submission', async () => {
  const h = harness(); await settle();
  h.document.getElementById('Confirm-Email').value = 'other@example.invalid';
  h.submit(); await settle();
  assert.equal(posts(h).length, 0);
  assert.match(h.document.querySelector('.w-form-fail').textContent, /do not match/);
});

test('closed business prevents order POST even if submit event is dispatched', async () => {
  const h = harness({ closed: true }); await settle(); h.submit(); await settle();
  assert.equal(posts(h).length, 0);
  assert.match(h.document.getElementById('speedy-order-hours-top').textContent, /closed/);
});

test('ambiguous acknowledgement keeps entered details and blocks duplicate retry', async () => {
  for (const options of [{ order: { success: true } }, { failOrder: true }]) {
    const h = harness(options); await settle(); h.submit(); await settle();
    h.submit(); await settle();
    assert.equal(posts(h).length, 1);
    assert.notEqual(h.form.style.display, 'none');
    assert.equal(h.document.getElementById('Name-5').value, 'Synthetic Test');
    assert.match(h.document.querySelector('.w-form-fail').textContent, /avoid a duplicate order/);
  }
});

test('known rejection allows corrected retry', async () => {
  const h = harness({ status: 400, order: { success: false, code: 'INVALID_DELIVERY_ADDRESS', message: 'Check the address.' } });
  await settle(); h.submit(); await settle(); h.submit(); await settle();
  assert.equal(posts(h).length, 2);
  assert.match(h.document.querySelector('.w-form-fail').textContent, /Check the address/);
});

test('private tracking token is removed from the URL before analytics', () => {
  const token = 'x'.repeat(43); let replacement;
  const window = { location: { hash: '#track=' + token, pathname: '/', search: '' },
    history: { replaceState: (_a, _b, value) => replacement = value }, addEventListener() {} };
  vm.runInNewContext(source('tracking-link.js'), { window });
  assert.equal(window.speedyTrackingLink, token);
  assert.equal(replacement, '/#track-my-order');
  assert.ok(html.indexOf('/js/tracking-link.js') < html.indexOf('/js/analytics.js'));
});

test('all page and CSS assets are local and present; hosted editor is absent', () => {
  const { document } = parseHTML(html);
  const urls = [...document.querySelectorAll('[src],link[href]')].map(el => el.getAttribute('src') || el.getAttribute('href'));
  for (const url of urls.filter(url => url.startsWith('/'))) {
    if (url === '/js/site-config.js') continue;
    assert.ok(fs.existsSync(path.join(root, 'src', url)), url);
  }
  const styles = fs.readdirSync(path.join(root, 'src/assets')).filter(file => file.endsWith('.css'));
  for (const file of styles) {
    const css = fs.readFileSync(path.join(root, 'src/assets', file), 'utf8');
    for (const [, url] of css.matchAll(/url\(["']?(\/assets\/[^)'"\s]+)/g)) assert.ok(fs.existsSync(path.join(root, 'src', url)), url);
    assert.doesNotMatch(css, /https:\/\/(?:cdn\.prod\.website-files|uploads-ssl\.webflow)\.com/);
  }
  assert.doesNotMatch(html, /cdn\.prod\.website-files\.com|webflow\.[^"\s]*\.js|jquery|data-turnstile-sitekey/);
  assert.equal(document.querySelector('[type="submit"]').hasAttribute('disabled'), true);
  assert.equal(document.querySelector('form').getAttribute('method'), 'post');
});

test('build keeps preview isolated and enables production only on exact business domains', () => {
  const build = args => execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs'), ...args]);
  const runConfig = hostname => {
    const { document } = parseHTML('<html><head></head><body></body></html>');
    const window = { location: { hostname } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'dist/js/site-config.js'), 'utf8'), { window, document });
    return window.speedySite.live;
  };
  try {
    build([]);
    assert.equal(runConfig('www.speedysweeties.ca'), false);
    assert.match(fs.readFileSync(path.join(root, 'dist/robots.txt'), 'utf8'), /Disallow: \//);
    build(['--production']);
    assert.equal(runConfig('www.speedysweeties.ca'), true);
    assert.equal(runConfig('speedysweeties.ca'), true);
    assert.equal(runConfig('speedy-sweeties-website.onrender.com'), false);
    assert.equal(runConfig('speedysweeties.ca.example.invalid'), false);
    assert.equal(runConfig('localhost'), false);
  } finally {
    build([]);
  }
});
