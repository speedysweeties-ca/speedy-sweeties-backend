const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, cpSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { dispatcherRelease } = require('../scripts/dispatcherRelease.cjs');
const { DISPATCHER_RELEASE } = require('../dist/generated/dispatcherRelease');

test('API release identity matches current dispatcher source', () => {
  assert.equal(DISPATCHER_RELEASE, dispatcherRelease());
  assert.match(DISPATCHER_RELEASE, /^[a-f0-9]{64}$/);
});

test('dispatcher changes alter identity; tests and unrelated files do not', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'dispatcher-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(path.join(__dirname, '../speedy-dispatcher'), root, { recursive: true,
    filter: file => !/(?:^|[/\\])(?:node_modules|dist|\.git)(?:[/\\]|$)/.test(file) });
  const original = dispatcherRelease(root);
  assert.equal(original, DISPATCHER_RELEASE);
  writeFileSync(path.join(root, 'src/fixture.test.ts'), 'test-only change');
  writeFileSync(path.join(root, 'README.md'), 'not a dispatcher release');
  assert.equal(dispatcherRelease(root), original);
  writeFileSync(path.join(root, 'src/fixture.ts'), 'export const changed = true;');
  assert.notEqual(dispatcherRelease(root), original);
});
