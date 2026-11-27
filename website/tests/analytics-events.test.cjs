const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const root = path.join(__dirname, '..');

function harness(hostname = 'www.speedysweeties.ca') {
  const { document, Event, CustomEvent, Element } = parseHTML(fs.readFileSync(path.join(root, 'src/index.html'), 'utf8'));
  const events = [];
  const window = { location: { hostname }, gtag: (...args) => events.push(args) };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/js/analytics-events.js'), 'utf8'), { document, window, Element });
  document.dispatchEvent(new Event('DOMContentLoaded'));
  return { document, events, Event, CustomEvent };
}

test('current order CTAs and nested labels use one stable click event, including resume copy', () => {
  const h = harness();
  const links = [...h.document.querySelectorAll('[data-order-start]')];
  assert.equal(links.length, 4);
  for (const link of links) {
    (link.querySelector('span') || link).dispatchEvent(new h.Event('click', { bubbles: true }));
    link.textContent = 'Continue my order';
    link.click();
  }
  assert.deepEqual(h.events, Array.from({ length: 8 }, () => ['event', 'order_online_click']));
});

test('contact and phone clicks stay distinct and form contents never enter event arguments', () => {
  const h = harness();
  h.document.getElementById('Email').value = 'private@example.invalid';
  h.document.querySelector('.nav-link[href="#contact-us"]').click();
  h.document.querySelector('a[href^="tel:"]').click();
  const form = h.document.getElementById('email-form');
  form.dispatchEvent(new h.Event('submit', { bubbles: true }));
  assert.deepEqual(h.events, [['event', 'contact_us_click'], ['event', 'phone_click']]);
  h.document.dispatchEvent(new h.CustomEvent('speedy:order-created', { detail: { trackingToken: 'private-token', order: { customerName: 'private-name' } } }));
  assert.deepEqual(h.events.at(-1), ['event', 'order_request_submit']);
  assert.doesNotMatch(JSON.stringify(h.events), /private|@|token/);
});

test('other preview hosts cannot emit production events', () => {
  const h = harness('localhost');
  h.document.querySelector('[data-order-start]').click();
  h.document.dispatchEvent(new h.CustomEvent('speedy:order-created'));
  assert.equal(h.events.length, 0);
});
