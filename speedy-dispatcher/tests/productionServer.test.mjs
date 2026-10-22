import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { createDispatcherServer } from '../server.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'speedy-static-security-'));
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>Dispatcher</title><div id="root"></div>');
  await writeFile(join(directory, 'assets/app.js'), 'window.dispatcherLoaded = true;');
  await writeFile(join(directory, 'assets/app.js.map'), 'private source map');
  await writeFile(join(directory, '.env'), 'TEST_SECRET=must-not-be-served');
  const server = createDispatcherServer({ directory }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return (path, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path, method,
      headers: { Host: 'speedy-dispatcher.onrender.com', ...headers } }, res => {
      let body = '';
      res.setEncoding('utf8'); res.on('data', data => { body += data; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.end();
  });
}

test('serves production assets, SPA navigation and staff-password query without stale HTML', async t => {
  const read = await fixture(t);
  for (const path of ['/', '/?staff-password=1', '/dispatcher']) {
    const r = await read(path);
    assert.equal(r.status, 200); assert.match(r.body, /id="root"/);
    assert.equal(r.headers['cache-control'], 'no-store');
  }
  const script = await read('/assets/app.js');
  assert.equal(script.status, 200); assert.match(script.headers['content-type'], /javascript/);
  assert.match(script.body, /dispatcherLoaded/);
  const head = await read('/', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(head.body, '');
});

test('does not serve project files, dotfiles, source maps, or development endpoints', async t => {
  const read = await fixture(t);
  for (const path of ['/.env', '/%2eenv', '/assets/../.env', '/assets/%2e%2e/.env',
    '/assets/app.js.map', '/src/App.tsx', '/node_modules/express/package.json', '/package.json',
    '/server.mjs', '/@vite/client', '/@fs/etc/passwd', '/__open-in-editor?file=server.mjs',
    '/assets/missing.js', '/api/v1/orders']) {
    const r = await read(path);
    assert.equal(r.status, 404, path);
    assert.doesNotMatch(r.body, /TEST_SECRET|private source|id="root"|stack|\/tmp\//);
  }
  assert.equal((await read('/%E0%A4%A')).status, 400);
});

test('validates actual Host, rejects unsafe methods, and adds compatible protection headers', async t => {
  const read = await fixture(t);
  assert.equal((await read('/', { headers: { Host: 'attacker.example', 'X-Forwarded-Host': 'speedy-dispatcher.onrender.com' } })).status, 403);
  assert.equal((await read('/', { headers: { Host: 'speedy-dispatcher.onrender.com.attacker.example' } })).status, 403);
  assert.equal((await read('/', { headers: { Host: 'attacker@speedy-dispatcher.onrender.com' } })).status, 403);
  assert.equal((await read('/', { headers: { Host: 'localhost:10000' } })).status, 200);
  const post = await read('/', { method: 'POST' });
  assert.equal(post.status, 405); assert.equal(post.headers.allow, 'GET, HEAD');
  const page = await read('/');
  assert.equal(page.headers['x-powered-by'], undefined);
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  assert.equal(page.headers['x-frame-options'], 'DENY');
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(page.headers['content-security-policy'], /object-src 'none'/);
  // Maps/scripts/API calls and external B&D windows are not blocked by a new
  // unverified resource allowlist. The existing frontend controls those URLs.
  assert.doesNotMatch(page.headers['content-security-policy'], /default-src|script-src|connect-src/);
  assert.equal(page.headers['cross-origin-opener-policy'], 'same-origin-allow-popups');
});
