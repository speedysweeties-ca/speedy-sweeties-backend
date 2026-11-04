const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { prisma } = require('../dist/lib/prisma');
const { default: router, pageViewKeys } = require('../dist/routes/pageViews.routes');

test('public counter validates origin/key, never increments GETs, preserves bigint totals and limits abuse', async t => {
  let writes = 0;
  let fail = false;
  const original = prisma.$queryRaw;
  t.after(() => { prisma.$queryRaw = original; });
  prisma.$queryRaw = async (sql, page) => {
    writes++;
    assert.ok(pageViewKeys.has(page));
    assert.match(sql.join('?'), /ON CONFLICT/);
    if (fail) throw new Error('private database details');
    return [{ views: 9007199254740993n }];
  };
  const app = express();
  app.use('/page-views', router);
  app.use((err, req, res, next) => res.status(503).json({ success: false }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const call = (page, method = 'POST', origin = 'https://www.speedysweeties.ca') => fetch(`http://127.0.0.1:${server.address().port}/page-views/${page}`, { method, headers: origin ? { origin } : {} });
  assert.equal((await call('home', 'POST', '')).status, 403);
  assert.equal((await call('home', 'POST', 'https://preview.example')).status, 403);
  assert.equal((await call('unknown')).status, 404);
  assert.equal((await call('home', 'GET')).status, 404);
  assert.equal(writes, 0);
  for (const page of pageViewKeys) {
    const res = await call(page);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { success: true, page, views: '9007199254740993' });
  }
  fail = true;
  assert.equal((await call('home')).status, 503);
  fail = false;
  for (let i = 0; i < 48; i++) await call('home');
  const before = writes;
  assert.equal((await call('home')).status, 429);
  assert.equal(writes, before);
});
