const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { parseHTML } = require('linkedom');
const root = path.join(__dirname, '..');
let services, renderServicePage;
before(async () => {
  ({ services } = await import(pathToFileURL(path.join(root, 'content/services.mjs'))));
  ({ renderServicePage } = await import(pathToFileURL(path.join(root, 'scripts/render-service-pages.mjs'))));
});

function harness({ live = false, acknowledged = false, storageBlocked = false } = {}) {
  const { document, Event, Element } = parseHTML(renderServicePage(services[0]));
  const gate = document.getElementById('age-gate');
  const events = [], writes = [], focused = [];
  Object.defineProperty(gate, 'open', { get: () => gate.hasAttribute('open') });
  gate.showModal = () => gate.setAttribute('open', '');
  gate.close = () => gate.removeAttribute('open');
  for (const id of ['age-yes', 'page-title', 'age-declined-title']) document.getElementById(id).focus = () => focused.push(id);
  const window = { speedySite: { live }, gtag: (...args) => events.push(args), sessionStorage: {
    getItem: () => { if (storageBlocked) throw Error('Blocked'); return acknowledged ? '19-plus' : null; },
    setItem: (key, value) => { if (storageBlocked) throw Error('Blocked'); writes.push({ key, value }); }
  }};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/js/service-pages.js'), 'utf8'), { document, window, Element });
  return { document, gate, events, writes, focused, Event, click: id => document.getElementById(id).dispatchEvent(new Event('click', { bubbles: true })) };
}

test('five independent pages have unique metadata, working assets, navigation and main-site destinations', () => {
  assert.equal(services.length, 5);
  for (const field of ['slug', 'title', 'description']) assert.equal(new Set(services.map(s => s[field])).size, 5);
  const home = parseHTML(fs.readFileSync(path.join(root, 'src/index.html'), 'utf8')).document;
  for (const service of services) {
    const { document } = parseHTML(renderServicePage(service, { production: true }));
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.equal(document.querySelector('meta[name="robots"]'), null);
    assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'), `https://www.speedysweeties.ca/${service.slug}/`);
    assert.equal(document.querySelectorAll('form').length, 0);
    assert.equal(document.querySelectorAll('[src="/js/analytics.js"]').length, 1);
    assert.ok(document.querySelector('a[data-landing-destination]'));
    assert.ok(home.querySelector(`a[href="/${service.slug}/"]`));
    assert.equal(document.querySelectorAll('footer nav a').length, 5);
    JSON.parse(document.querySelector('[type="application/ld+json"]').textContent);
    for (const el of document.querySelectorAll('a[href^="/#"]')) assert.ok(home.getElementById(el.getAttribute('href').slice(2)), el.getAttribute('href'));
    for (const el of document.querySelectorAll('a[href^="#"]')) assert.ok(document.getElementById(el.getAttribute('href').slice(1)));
    for (const el of document.querySelectorAll('[src^="/"],link[href^="/assets/"]')) {
      const asset = el.getAttribute('src') || el.getAttribute('href');
      if (asset !== '/js/site-config.js') assert.ok(fs.existsSync(path.join(root, 'src', asset)), asset);
    }
    assert.ok(parseHTML(renderServicePage(service)).document.querySelector('meta[name="robots"][content="noindex, nofollow"]'));
  }
});

test('age gate rejects under-19 and Escape, then permits explicit adult acknowledgement', () => {
  const h = harness();
  assert.equal(h.gate.open, true);
  assert.ok(h.document.getElementById('service-content').hasAttribute('inert'));
  const cancel = new h.Event('cancel', { cancelable: true }); h.gate.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  h.click('age-no');
  assert.equal(h.gate.open, true);
  assert.equal(h.document.getElementById('age-declined').hidden, false);
  assert.equal(h.writes.length, 0);
  h.click('age-back'); h.click('age-yes');
  assert.equal(h.gate.open, false);
  assert.equal(h.document.getElementById('service-content').hasAttribute('inert'), false);
  assert.equal(h.writes[0].value, '19-plus');
  assert.equal(h.focused.at(-1), 'page-title');
  assert.equal(h.events.length, 0, 'Preview must not emit analytics');
});

test('session acknowledgement works across pages and blocked storage still permits this page', () => {
  const returning = harness({ acknowledged: true });
  assert.equal(returning.gate.open, false);
  assert.equal(returning.document.getElementById('service-content').inert, false);
  const blocked = harness({ storageBlocked: true });
  assert.equal(blocked.gate.open, true); blocked.click('age-yes');
  assert.equal(blocked.gate.open, false);
});

test('live landing events contain only service and destination, never an order conversion or user data', () => {
  const h = harness({ live: true });
  const link = h.document.querySelector('[data-landing-destination="order"]');
  link.dispatchEvent(new h.Event('click', { bubbles: true }));
  assert.equal(h.events.length, 0);
  h.click('age-yes'); link.dispatchEvent(new h.Event('click', { bubbles: true }));
  assert.deepEqual(h.events.map(e => e[1]), ['landing_age_confirmation', 'service_landing_click']);
  assert.deepEqual(Object.keys(h.events[1][2]).sort(), ['destination', 'service']);
  assert.equal(h.events[1][2].destination, 'order');
  assert.ok(h.document.getElementById('landing-preview').hidden);
});

test('cannabis page is informational and has no cannabis sales or ordering control', () => {
  const { document } = parseHTML(renderServicePage(services.find(s => s.key === 'cannabis')));
  assert.equal(document.querySelector('[data-landing-destination="order"]'), null);
  assert.match(document.getElementById('details').textContent, /authorization holder or their employee/);
  assert.ok(document.querySelector('a[href="https://www.ontario.ca/laws/regulation/180468"]'));
});
