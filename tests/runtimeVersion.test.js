const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = resolve(__dirname, '..');
const expected = '24.22.1';

for (const directory of [root, resolve(root, 'speedy-dispatcher')]) {
  test(`runtime pins and build guard: ${directory === root ? 'backend/cron' : 'dispatcher'}`, () => {
    const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(resolve(directory, 'package-lock.json'), 'utf8'));
    assert.equal(readFileSync(resolve(directory, '.node-version'), 'utf8').trim(), expected);
    assert.equal(manifest.engines.node, expected);
    assert.equal(lock.packages[''].engines.node, expected);
    assert.equal(process.versions.node, expected, 'Tests must run on the production-pinned runtime');
    const expression = /^node -e "([^"]+)"$/.exec(manifest.scripts.prebuild)?.[1];
    assert.ok(expression, 'A self-contained build guard must work inside each Render rootDir');
    const run = (prefix = '') => spawnSync(process.execPath, ['-e', prefix + expression], {
      cwd: directory, encoding: 'utf8', timeout: 5000,
      env: { PATH: process.env.PATH }
    });
    assert.equal(run().status, 0);
    // Model a higher-precedence Render override without installing an old runtime.
    const rejected = run("Object.defineProperty(process.versions, 'node', { value: '24.14.1' });");
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Use the pinned Node.js runtime before building/);
  });
}

test('CI uses the checked-in pin, including its help and isolated-database checks', () => {
  const workflow = readFileSync(resolve(root, '.github/workflows/backend-ci.yml'), 'utf8');
  assert.doesNotMatch(workflow, /^\s*node-version:/m);
  const jobs = Object.fromEntries(
    [...workflow.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|(?![\s\S]))/gm)]
      .map(([, name, body]) => [name, body])
  );
  for (const name of ['validate', 'privacy-database']) {
    const job = jobs[name];
    assert.ok(job, `Required CI job: ${name}`);
    assert.match(job, /node-version-file: \.node-version/);
    assert.match(job, /fetch-depth: 0/);
    assert.match(job, /node --test --test-concurrency=1 tests\/runtimeVersion\.test\.js/);
    assert.ok(job.indexOf('uses: actions/setup-node@') < job.indexOf('run: node --test'));
  }
  assert.ok(jobs.validate.indexOf('uses: actions/setup-node@') < jobs.validate.indexOf('run: node scripts/checkDispatcherHelp.cjs'));
  assert.match(jobs.validate, /node tests\/prepareEditPauseDatabase\.cjs/);
  assert.match(jobs.validate, /CHECK_EDIT_PAUSE_DATABASE=1 node --test --test-concurrency=1 tests\/orderEditPause\.database\.test\.js/);
  assert.match(jobs.validate, /CHECK_BND_HISTORY_DATABASE=1 node --test --test-concurrency=1 tests\/bndWaitingHistory\.database\.test\.js/);
  assert.match(jobs['privacy-database'], /node tests\/preparePrivacyDatabase\.cjs/);
  assert.match(jobs['privacy-database'], /node --test --test-concurrency=1 tests\/privacyBaseline\.test\.js tests\/privacyDeletion\.database\.test\.js tests\/privacyRoutes\.database\.test\.js tests\/privacyDelivery\.test\.js/);
});
