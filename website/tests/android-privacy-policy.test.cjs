const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { parseHTML } = require('linkedom');
const root = path.join(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
let renderer, published, android;
before(async () => {
  ({ proposedPrivacyPolicy: published } = await import(pathToFileURL(path.join(root, 'content/privacy-policy-proposed.mjs'))));
  ({ androidPrivacyPolicy: android } = await import(pathToFileURL(path.join(root, 'content/privacy-policy-android-proposed.mjs'))));
  renderer = await import(pathToFileURL(path.join(root, 'scripts/render-privacy-page.mjs')));
});

test('Android review does not mutate approved policy, attribution, retention or request handling', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(published)).digest('hex'),
    'e4a9ae2e4c5089058b1c2122e40de9f006b23a1f53c017322d5471a845126ee9');
  assert.doesNotMatch(published.introduction, /Android/);
  for (const id of ['retention', 'requests', 'website', 'order-sharing']) {
    assert.deepEqual(android.sections.find(s => s.id === id), published.sections.find(s => s.id === id));
  }
  const details = android.sections.find(s => s.id === 'customer-details').paragraphs;
  const oldDetails = published.sections.find(s => s.id === 'customer-details').paragraphs;
  assert.equal(details[0], oldDetails[0]);
  assert.equal(details[2], oldDetails[2]);
  assert.match(details[1], /not promotional follow-up or targeting/);
  assert.doesNotMatch(details[1], /preparation of draft messages|optional promotional communications/);
});

test('one opt-in preview supplies consistent Android and iOS wording on all policy copies', () => {
  const options = { proposed: true, android: true };
  const candidate = renderer.replaceHomepagePolicy(home, options);
  const { document } = parseHTML(renderer.renderPrivacyPage(candidate, options));
  const copy = document.querySelector('.policy-copy').textContent;
  for (const section of android.sections) {
    assert.ok(document.getElementById(section.id));
    for (const paragraph of section.paragraphs) assert.ok(copy.includes(paragraph));
  }
  assert.match(copy, /ca\.speedysweeties\.customer/);
  assert.match(copy, /may process it on its servers/);
  assert.match(copy, /Android 1\.0 \(5\).*does not have the iPhone\/iPad installation-wide/);
  assert.match(copy, /In Android versions that show Agree and speak \/ Not now/);
  assert.match(copy, /On iPhone and iPad, choose Not now/);
  assert.match(copy, /does not mean every profile or tracking field is separately encrypted/);
  assert.match(copy, /cannot always be recalled/);
  assert.match(renderer.proposedPolicyReviewText({ android: true }), /Effective date: not assigned/);
  assert.match(renderer.proposedPolicyReviewText({ android: true }), /Android customer app/);
  assert.match(renderer.renderPrivacyPage(candidate, { ...options, legacy: true }), /android-customer/);
  assert.equal(document.querySelectorAll('form, input, iframe').length, 0);
  assert.deepEqual([...document.querySelectorAll('script')].map(s => s.getAttribute('src')), ['/js/site-config.js']);
  assert.match(document.querySelector('meta[name="robots"]').getAttribute('content'), /noindex/);
  assert.doesNotMatch(document.querySelector('.policy-dates').textContent, /Effective Date: \d/);
});

test('production cannot enable Android review even with existing approval/date settings', t => {
  assert.throws(() => renderer.proposedPolicyBlocks({ android: true, production: true, approved: true, publicationDate: '2026-11-11' }), /preview-only/);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'speedy-android-policy-guard-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  for (const name of ['scripts', 'content', 'src']) fs.cpSync(path.join(root, name), path.join(fixture, name), { recursive: true });
  fs.mkdirSync(path.join(fixture, 'dist'));
  const output = path.join(fixture, 'dist/index.html');
  fs.writeFileSync(output, 'preserve existing output');
  const child = spawnSync(process.execPath, [path.join(fixture, 'scripts/build.mjs'), '--production', '--proposed-android-privacy-policy'], {
    env: { ...process.env, PUBLIC_CUSTOMER_PAGES_APPROVED: 'true', PUBLIC_PRIVACY_POLICY_DATE: '2026-11-11' }, encoding: 'utf8'
  });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /preview-only/);
  assert.equal(fs.readFileSync(output, 'utf8'), 'preserve existing output');
});

test('Android preview command produces isolated pages without changing the default source', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'speedy-android-policy-build-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  for (const name of ['scripts', 'content', 'src']) fs.cpSync(path.join(root, name), path.join(fixture, name), { recursive: true });
  const child = spawnSync(process.execPath, [path.join(fixture, 'scripts/build.mjs'), '--proposed-android-privacy-policy'], {
    env: { ...process.env, PUBLIC_CUSTOMER_PAGES_APPROVED: 'false', PUBLIC_PRIVACY_POLICY_DATE: '' }, encoding: 'utf8'
  });
  assert.equal(child.status, 0, child.stderr);
  const read = file => fs.readFileSync(path.join(fixture, 'dist', file), 'utf8');
  for (const file of ['index.html', 'privacy-policy/index.html', 'privacy/index.html']) assert.match(read(file), /ca\.speedysweeties\.customer/);
  assert.match(read('js/site-config.js'), /const production = false/);
  assert.equal(fs.readFileSync(path.join(fixture, 'src/index.html'), 'utf8'), home);
});
