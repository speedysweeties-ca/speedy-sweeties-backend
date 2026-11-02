const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
async function harness(live) {
  const { renderDriverPage } = await import(pathToFileURL(path.join(root, 'scripts/render-driver-page.mjs')));
  const { document, Event } = parseHTML(renderDriverPage({ production: live }));
  const form = document.getElementById('driver-application');
  form.reportValidity = () => true;
  document.getElementById('applicant-smartserve').focus = () => {};
  document.getElementById('applicant-smartserve').value = 'TEST-12345';
  for (const id of ['vehicle', 'licence']) Object.defineProperty(document.getElementById('applicant-' + id), 'value', { value: 'Yes' });
  document.getElementById('application-copy').focus = () => {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/js/driver-application.js'), 'utf8'), { document, window: { speedySite: { live } } });
  return { document, form, Event };
}
test('preview cannot prepare applications; application page has no analytics or named query fields', async () => {
  const { document, form, Event } = await harness(false);
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.ok(document.getElementById('application-fields').hasAttribute('disabled'));
  assert.ok(document.getElementById('application-review').hidden);
  assert.equal(document.querySelectorAll('[name]:is(input,textarea,select),script[src*="analytics"]').length, 0);
  assert.match(document.getElementById('application-status').textContent, /Preview only/);
});
test('invalid applications stay blocked; valid draft is encoded, not sent, and invalidated on edit', async () => {
  const { document, form, Event } = await harness(true);
  form.reportValidity = () => false;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.ok(document.getElementById('application-review').hidden);
  form.reportValidity = () => true;
  for (const [id, value] of Object.entries({ name: 'Synthetic Applicant', phone: '519-555-0100', email: 'test@example.invalid', city: 'Guelph', availability: 'Evenings & weekends', experience: '<b>Plain text</b>' })) document.getElementById('applicant-' + id).value = value;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  const link = document.getElementById('application-email').getAttribute('href');
  assert.ok(link.startsWith('mailto:speedysweeties@hotmail.com?'));
  const params = new URLSearchParams(link.split('?')[1]);
  assert.match(params.get('body'), /Smart Serve number: TEST-12345/);
  assert.match(params.get('body'), /Evenings & weekends/);
  assert.match(params.get('body'), /<b>Plain text<\/b>/);
  assert.match(document.getElementById('application-status').textContent, /has not been sent/);
  assert.equal(document.getElementById('application-review').hidden, false);
  form.dispatchEvent(new Event('input', { bubbles: true }));
  assert.ok(document.getElementById('application-review').hidden);
  assert.equal(document.getElementById('application-email').getAttribute('href'), null);
  assert.equal(document.getElementById('application-copy').value, '');
});

test('Smart Serve number is required and blank or whitespace-only values cannot prepare email', async () => {
  const { document, form, Event } = await harness(true);
  const field = document.getElementById('applicant-smartserve');
  assert.ok(field.hasAttribute('required'));
  const pattern = new RegExp('^(?:' + field.getAttribute('pattern') + ')$');
  assert.ok(pattern.test('TEST-12345'));
  for (const value of ['', '   ', '\t']) {
    assert.equal(pattern.test(value), false);
    field.value = value;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    assert.ok(document.getElementById('application-review').hidden);
    assert.equal(document.getElementById('application-email').getAttribute('href'), null);
    assert.match(document.getElementById('application-status').textContent, /enter your Smart Serve number/);
  }
});
