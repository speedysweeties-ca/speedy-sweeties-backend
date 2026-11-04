const test = require('node:test');
const assert = require('node:assert/strict');

test('real migrated counters preserve concurrent loads and separate pages', { skip: process.env.CHECK_PAGE_VIEWS_DATABASE !== '1' }, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(process.env.CI, 'true');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/speedy_sweeties_ci');
  const { prisma } = require('../dist/lib/prisma');
  const express = require('express');
  const router = require('../dist/routes/pageViews.routes').default;
  assert.equal(await prisma.pageViewCounter.count(), 0, 'requires fresh synthetic table');
  const app = express(); app.use('/views', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); await prisma.$disconnect(); });
  const call = page => fetch(`http://127.0.0.1:${server.address().port}/views/${page}`, {method: 'POST', headers: {origin: 'https://www.speedysweeties.ca'}});
  const responses = await Promise.all(Array.from({length: 30}, () => call('home')));
  assert.ok(responses.every(r => r.status === 200));
  const counts = await Promise.all(responses.map(async r => (await r.json()).views));
  assert.equal(new Set(counts).size, 30);
  assert.equal((await prisma.pageViewCounter.findUnique({where: {page: 'home'}})).views, 30n);
  assert.equal((await (await call('beer')).json()).views, '1');
  await prisma.$disconnect();
  assert.equal((await (await call('home')).json()).views, '31');
  await assert.rejects(prisma.pageViewCounter.create({data: {page: 'arbitrary'}}));
  await assert.rejects(prisma.pageViewCounter.update({where: {page: 'beer'}, data: {views: -1n}}));
});
