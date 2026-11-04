const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { parseHTML } = require('linkedom');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'src/js/page-counter.js'), 'utf8');

test('build adds exactly seven separate counters and excludes privacy pages', t => {
  const fixture = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'speedy-counter-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  for (const name of ['scripts', 'content', 'src']) fs.cpSync(path.join(root, name), path.join(fixture, name), { recursive: true });
  execFileSync(process.execPath, [path.join(fixture, 'scripts/build.mjs')]);
  const pages = [['', 'home'], ['drive-with-us', 'drivers'], ['beer-delivery-guelph', 'beer'], ['alcohol-delivery-guelph', 'alcohol'], ['vape-delivery-guelph', 'vapes'], ['cannabis-delivery-guelph', 'cannabis'], ['convenience-delivery-guelph', 'convenience']];
  for (const [slug, key] of pages) {
    const { document } = parseHTML(fs.readFileSync(path.join(fixture, 'dist', slug, 'index.html'), 'utf8'));
    assert.equal(document.querySelectorAll('[data-page-counter]').length, 1);
    assert.equal(document.querySelector('[data-page-counter]').dataset.pageCounter, key);
    assert.equal(document.querySelectorAll('script[src="/js/page-counter.js"]').length, 1);
    assert.ok(document.querySelector('link[href="/assets/page-counter.css"]'));
  }
  for (const slug of ['privacy', 'privacy-policy']) assert.ok(!fs.readFileSync(path.join(fixture, 'dist', slug, 'index.html'), 'utf8').includes('data-page-counter'));
});

async function run({live = true, hostname = 'www.speedysweeties.ca', failure = false, views = '12345'} = {}) {
  const { document } = parseHTML('<html><body><div data-page-counter="beer"><span data-page-count>Loading…</span></div></body></html>');
  const calls = [];
  const context = { document, window: { speedySite: { live }, location: { hostname } }, AbortSignal,
    fetch: async (...args) => { calls.push(args); if (failure) throw Error('offline'); return { ok: true, json: async () => ({ views }) }; } };
  vm.runInNewContext(code, context);
  vm.runInNewContext(code, context);
  await new Promise(resolve => setImmediate(resolve));
  return { calls, text: document.querySelector('[data-page-count]').textContent };
}
test('production increments once and formats totals; preview/other hosts never call API', async () => {
  const result = await run();
  assert.equal(result.text, '12,345');
  assert.equal(result.calls.length, 1);
  assert.match(result.calls[0][0], /page-views\/beer$/);
  assert.equal(result.calls[0][1].credentials, 'omit');
  for (const options of [{live: false}, {hostname: 'speedysweeties.ca'}, {hostname: 'preview.example'}]) {
    const preview = await run(options);
    assert.equal(preview.calls.length, 0);
    assert.equal(preview.text, 'Preview');
  }
});
test('failures or invalid totals show unavailable, never fake zero and never retry', async () => {
  for (const options of [{failure: true}, {views: '<img>'}, {views: -1}]) {
    const result = await run(options);
    assert.equal(result.text, 'Temporarily unavailable');
    assert.equal(result.calls.length, 1);
  }
});
