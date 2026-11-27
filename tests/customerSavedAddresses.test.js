const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { prisma } = require('../dist/lib/prisma');
const { mutateCustomerAddressController, savedAddressSchema } = require('../dist/controllers/customerAddress.controller');
const routes = require('../dist/routes/customer.routes').default;
const fields = { addressLine1: '1 Example Street', city: 'Guelph', province: 'ON', unitNumber: '2', buzzCode: '123' };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function fixture(t, initial = []) {
  let rows = structuredClone(initial);
  const old = prisma.$transaction;
  prisma.$transaction = async fn => fn({
    $queryRaw: async () => [{ id: 'owner' }],
    customerAddress: {
      findFirst: async ({ where }) => rows.find(a => a.customerId === where.customerId && (!where.id || a.id === where.id)) || null,
      count: async () => rows.length,
      findMany: async () => structuredClone(rows),
      updateMany: async ({ data }) => { rows.forEach(a => Object.assign(a, data)); },
      update: async ({ where, data }) => Object.assign(rows.find(a => a.id === where.id), data),
      create: async ({ data }) => rows.push({ id: String(rows.length + 1), ...data }),
      delete: async ({ where }) => { rows = rows.filter(a => a.id !== where.id); },
    },
  });
  t.after(() => { prisma.$transaction = old; });
  return () => rows;
}
async function mutate(method, id, body = fields) {
  const res = response(); await mutateCustomerAddressController({ method, params: { id: 'owner', addressId: id }, body }, res); return res;
}
test('address validation rejects blank, oversized, extra and wrongly typed fields', () => {
  for (const change of [{ label: 'Home' }, { addressLine1: 'a'.repeat(251) }, { buzzCode: 'a'.repeat(51) }, { isDefault: 'true' }, { customerId: 'other' }])
    assert.equal(savedAddressSchema.safeParse({ ...fields, ...change }).success, false);
  assert.equal(savedAddressSchema.parse({ ...fields, unitNumber: ' ' }).unitNumber, null);
});
test('first saved address is default; later address preserves it; explicit default switches', async t => {
  const rows = fixture(t);
  assert.equal((await mutate('POST')).code, 200);
  await mutate('POST', null, fields);
  assert.deepEqual(rows().map(a => a.isDefault), [true, false]);
  await mutate('PUT', '2', { ...fields, isDefault: true });
  assert.deepEqual(rows().map(a => a.isDefault), [false, true]);
  assert.deepEqual(rows().map(a => a.label), ['Address 1', 'Address 2']);
  assert.equal(rows()[0].buzzCode, '123');
});
test('cross-customer address edits and deletes return 404 without writing', async t => {
  const rows = fixture(t, [{ id: 'foreign', customerId: 'other', ...fields, isDefault: true }]);
  for (const method of ['PUT', 'DELETE']) assert.equal((await mutate(method, 'foreign')).code, 404);
  assert.equal(rows()[0].customerId, 'other');
});
test('removing default promotes another entry and can remove the last entry', async t => {
  const rows = fixture(t, ['1', '2'].map((id, i) => ({ id, customerId: 'owner', ...fields, isDefault: i === 0 })));
  await mutate('DELETE', '1'); assert.equal(rows()[0].isDefault, true);
  await mutate('DELETE', '2'); assert.equal(rows().length, 0);
});
test('address limit prevents additions but permits correcting existing entries', async t => {
  const rows = fixture(t, Array.from({ length: 20 }, (_, i) => ({ id: String(i), customerId: 'owner', ...fields, isDefault: i === 0 })));
  assert.equal((await mutate('POST')).code, 400);
  assert.equal((await mutate('PUT', '1', { ...fields, buzzCode: '456' })).code, 200);
  assert.equal(rows().length, 20);
});
test('address routes reject unauthenticated requests before database access', async t => {
  const app = express(); app.use(express.json()); app.use('/customers', routes);
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r)));
  for (const [method, path] of [['GET', ''], ['POST', ''], ['PUT', '/x'], ['DELETE', '/x']]) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/customers/owner/addresses${path}`, { method });
    assert.equal(res.status, 401);
  }
});
test('drivers cannot read saved addresses; dispatchers can manage their customer entries', async t => {
  const rows = fixture(t);
  const { signAuthToken } = require('../dist/utils/jwt');
  const old = prisma.user.findUnique;
  let role = 'DRIVER';
  prisma.user.findUnique = async () => ({ id: 'staff', email: 'staff@example.invalid', role, isActive: true, authVersion: 0 });
  t.after(() => { prisma.user.findUnique = old; });
  const app = express(); app.use(express.json()); app.use('/customers', routes);
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r)));
  const token = signAuthToken({ userId: 'staff', email: 'staff@example.invalid', role: 'DRIVER' });
  const url = `http://127.0.0.1:${server.address().port}/customers/owner/addresses`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(url, { headers })).status, 403);
  role = 'DISPATCHER';
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify(fields) })).status, 200);
  assert.equal(rows().length, 1);
});

test('numbered labels stay stable after deletion and reuse the first available slot', async t => {
  const rows = fixture(t, [{ id: 'first', customerId: 'owner', ...fields, label: 'Address 1', isDefault: true },
    { id: 'third', customerId: 'owner', ...fields, label: 'Address 3', isDefault: false }]);
  await mutate('POST');
  assert.deepEqual(rows().map(a => a.label), ['Address 1', 'Address 3', 'Address 2']);
  await mutate('DELETE', 'first');
  assert.deepEqual(rows().map(a => a.label), ['Address 3', 'Address 2']);
  await mutate('POST');
  assert.equal(rows().at(-1).label, 'Address 1');
});
