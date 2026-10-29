const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const root = path.resolve(__dirname, '..');
const gates = ['PRIVACY_DELETION_ENABLED', 'PRIVACY_FULFILLMENT_ENABLED',
  'PRIVACY_VERIFICATION_EMAIL_ENABLED', 'PRIVACY_VERIFICATION_PHONE_ENABLED'];

test('simultaneous read-only probes share one promise; failure creates no autonomous retry', async () => {
  const { quiescentHandler } = require('../dist/quiescentServer');
  let attempts = 0, reject;
  const pending = new Promise((_resolve, fail) => { reject = fail; });
  const handler = quiescentHandler(() => { attempts++; return pending; });
  const response = () => ({ status: 0, text: '', writeHead(status) { this.status = status; }, end(text) { this.text = text; } });
  const first = response(), second = response();
  handler({ method: 'GET', url: '/api/v1/health/ready' }, first);
  handler({ method: 'GET', url: '/api/v1/health/ready' }, second);
  await Promise.resolve(); assert.equal(attempts, 1);
  reject(new Error('synthetic-private-timeout')); await pending.catch(() => {}); await delay(0);
  assert.equal(first.status, 503); assert.equal(second.status, 503);
  await delay(20); assert.equal(attempts, 1);
  const blocked = response(); handler({ method: 'GET', url: '/q/lighter' }, blocked);
  assert.equal(blocked.status, 503); assert.doesNotMatch(first.text + second.text, /synthetic-private/);
});
async function freePort() {
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve)); return port;
}
async function child(t, delta = {}, options = {}) {
  const port = options.port || await freePort();
  const env = { PATH: process.env.PATH, NODE_ENV: 'test', PORT: String(port),
    API_STARTUP_MODE: 'quiescent', SPEEDY_QUIESCENT_SYNTHETIC: 'yes',
    DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:9/speedy_quiescent_synthetic',
    ...Object.fromEntries(gates.map(k => [k, 'false'])), ...delta };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  const proc = spawn(process.execPath, ['--require', path.join(__dirname, 'quiescentStartupFixture.cjs'), path.join(root, 'dist/server.js')], {
    cwd: options.cwd || root, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = ''; proc.stdout.on('data', data => { output += data; }); proc.stderr.on('data', data => { output += data; });
  const exited = once(proc, 'exit');
  async function stop() { if (proc.exitCode === null && proc.signalCode === null) { proc.kill('SIGTERM'); await exited; } }
  t.after(stop);
  if (!options.failure) {
    for (let i = 0; !output.includes('LISTENING') && !output.includes('Server running on'); i++) {
      if (proc.exitCode !== null || i >= 200) { await stop(); assert.fail('Synthetic startup failed: ' + output); }
      await delay(10);
    }
  }
  const request = async (url, method = 'GET') => {
    const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, redirect: 'manual', signal: AbortSignal.timeout(3000),
      ...(method === 'POST' ? { headers: { authorization: 'synthetic-private-token', 'Content-Type': 'application/json' }, body: '{"private":"synthetic-private-body"}' } : {}) });
    return { status: r.status, headers: r.headers, text: await r.text() };
  };
  return { proc, port, request, stop, exited, output: () => output,
    async snapshot() { const response = once(proc, 'message'); proc.send('snapshot'); return (await response)[0]; } };
}

test('actual entrypoint imports only health/direct Prisma; exact health is read-only, every normal/private route blocked', async t => {
  const c = await child(t);
  assert.deepEqual((await c.snapshot()).sql, []); // No startup connect/query/job.
  const live = await c.request('/api/v1/health/live'); assert.equal(live.status, 200);
  assert.equal(JSON.parse(live.text).mode, 'quiescent'); assert.deepEqual((await c.snapshot()).sql, []);
  for (const url of ['/q/lighter', '/api/v1/loyalty', '/api/v1/orders', '/api/v1/auth/me', '/api/v1/privacy/deletion/admin/requests', '/track/private', '/webflow/address.js', '/api/v1/health/ready?secret=synthetic-private-input', '/api/v1/health/live/', '/API/v1/health/live']) {
    for (const method of ['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'PATCH']) {
      const r = await c.request(url, method); assert.equal(r.status, 503); assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.ok(!r.text.includes('synthetic-private')); if (method !== 'HEAD') assert.equal(JSON.parse(r.text).code, 'API_QUIESCENT');
    }
  }
  assert.deepEqual((await c.snapshot()).sql, []);
  const ready = await c.request('/api/v1/health/ready'); assert.equal(ready.status, 200);
  assert.equal(JSON.parse(ready.text).checks.database, 'ok');
  const s = await c.snapshot(); assert.equal(s.normalLoaded, false); assert.deepEqual(s.starts, []);
  assert.deepEqual(s.imports, ['direct-prisma']);
  assert.deepEqual(s.sql, ["SET TRANSACTION READ ONLY", "SET LOCAL statement_timeout='1500ms'", "SET LOCAL lock_timeout='500ms'", 'SELECT 1']);
  for (const url of ['/api/v1/health/live', '/api/v1/health/ready']) {
    for (const method of ['POST', 'HEAD', 'OPTIONS']) assert.equal((await c.request(url, method)).status, 503);
  }
  assert.doesNotMatch(c.output(), /synthetic-private|PRIVATE_.*ERROR|postgresql:/);
  await c.stop(); assert.equal((await c.exited)[0], 0);
});

test('database health failure stays quiescent before/after waiting; liveness and blocked routes stay honest', async t => {
  const c = await child(t, { SYNTHETIC_HEALTH_FAILURE: 'yes' });
  for (let i = 0; i < 2; i++) {
    const r = await c.request('/api/v1/health/ready'); assert.equal(r.status, 503);
    assert.equal(JSON.parse(r.text).checks.database, 'unavailable'); await delay(50);
    assert.equal((await c.request('/api/v1/health/live')).status, 200);
    assert.equal((await c.request('/q/lighter')).status, 503);
  }
  assert.equal((await c.snapshot()).normalLoaded, false); assert.doesNotMatch(c.output(), /PRIVATE_DATABASE/);
});

for (const [name, delta] of [
  ...['', 'QUIESCENT', ' quiescent', 'false', 'synthetic-private-invalid'].map(value => ['invalid mode ' + JSON.stringify(value), { API_STARTUP_MODE: value }]),
  ...gates.map(key => ['unsafe gate ' + key, { [key]: 'true' }]),
  ['missing gate', { PRIVACY_DELETION_ENABLED: undefined }],
  ['bad port', { PORT: 'synthetic-private-invalid' }],
  ['client constructor failure', { SYNTHETIC_CLIENT_FAILURE: 'yes' }],
  ['config read failure', { NODE_ENV: 'production', SYNTHETIC_DOTENV_FAILURE: 'yes' }],
]) test(name + ' stops, sanitized, with no normal fallback', async t => {
  const c = await child(t, delta, { failure: true }); const [code] = await c.exited;
  assert.equal(code, 1); assert.doesNotMatch(c.output(), /synthetic-private|PRIVATE_|Server running|LISTENING/);
  assert.match(c.output(), /API_STARTUP_STOPPED/);
});

test('listen failure cannot start ordinary application', async t => {
  const occupied = net.createServer().listen(0, '0.0.0.0'); await once(occupied, 'listening');
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  const c = await child(t, {}, { failure: true, port: occupied.address().port });
  assert.equal((await c.exited)[0], 1); assert.match(c.output(), /QUIESCENT_STARTUP_FAILED/);
  assert.doesNotMatch(c.output(), /Server running|LISTENING/);
});

test('selection survives real process restarts and does not switch after an in-process env mutation', async t => {
  const first = await child(t); first.proc.send('mutate-mode'); await first.snapshot();
  assert.equal((await first.request('/api/v1/orders')).status, 503); await first.stop();
  const second = await child(t); assert.equal((await second.request('/api/v1/orders')).status, 503);
  assert.equal((await second.snapshot()).normalLoaded, false);
  await second.stop();
  const released = await child(t, { API_STARTUP_MODE: 'normal', SYNTHETIC_ALLOW_NORMAL: 'yes' });
  assert.equal((await released.request('/')).text, 'synthetic normal app');
  assert.equal((await released.snapshot()).normalLoaded, true);
  released.proc.kill('SIGKILL'); await released.exited;
});

test('production-style dotenv selection is evaluated before application imports', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speedy-quiescent-config-'));
  t.after(() => { fs.unlinkSync(path.join(dir, '.env')); fs.rmdirSync(dir); });
  fs.writeFileSync(path.join(dir, '.env'), 'API_STARTUP_MODE=quiescent\n', { mode: 0o600 });
  const c = await child(t, { NODE_ENV: 'production', API_STARTUP_MODE: undefined }, { cwd: dir });
  assert.equal((await c.request('/api/v1/orders')).status, 503); assert.equal((await c.snapshot()).normalLoaded, false);
  await c.stop();
});

for (const mode of [undefined, 'normal']) test(`unchosen/explicit normal selects the ACTUAL original startup: ${mode}`, async t => {
  // Actual normalServer runs with synthetic business dependencies; no external I/O.
  const c = await child(t, { API_STARTUP_MODE: mode, SYNTHETIC_ALLOW_NORMAL: 'yes' });
  assert.equal((await c.request('/')).text, 'synthetic normal app');
  const s = await c.snapshot(); assert.equal(s.normalLoaded, true);
  assert.deepEqual(s.starts, ['sessions', 'repair', 'undispatched', 'hours', 'bnd', 'email']);
  assert.ok(!s.imports.includes('direct-prisma'));
  // Fixture rejects global timers, so normal stop uses its existing bounded timer:
  // use SIGKILL only on this synthetic process, with no live data/resources.
  c.proc.kill('SIGKILL'); await c.exited;
});

test('actual Prisma/PostgreSQL health transaction is READ ONLY; requests never mutate the guarded synthetic database', {
  skip: process.env.CHECK_QUIESCENT_DATABASE !== '1',
}, async t => {
  assert.equal(process.env.PRIVACY_SYNTHETIC_DATABASE, 'yes');
  const target = new URL(process.env.DATABASE_URL);
  assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.port, '5432');
  assert.equal(target.pathname, '/speedy_privacy_synthetic'); assert.equal(target.username, 'privacy_test');
  const c = await child(t, { SYNTHETIC_REAL_POSTGRES: 'yes', DATABASE_URL: process.env.DATABASE_URL });
  assert.equal((await c.request('/api/v1/orders', 'POST')).status, 503);
  assert.deepEqual((await c.snapshot()).sql, []);
  assert.equal((await c.request('/api/v1/health/ready')).status, 200);
  const s = await c.snapshot(); assert.equal(s.readonlyVerified, true); assert.equal(s.normalLoaded, false);
  assert.deepEqual(s.starts, []); assert.equal(s.sql.length, 4);
});
