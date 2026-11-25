const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('saved addresses migrate, serialize defaults, retain order snapshots and cascade on deletion', { skip: process.env.CHECK_SAVED_ADDRESSES_DATABASE !== 'yes' }, async t => {
  assert.equal(process.env.NODE_ENV, 'test');
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/speedy_addresses_synthetic');
  const { prisma: db } = require('../dist/lib/prisma');
  const { mutateCustomerAddressController: mutate } = require('../dist/controllers/customerAddress.controller');
  // This dedicated disposable database is created by CI and never shared with other suites.
  await db.$executeRawUnsafe('DROP TABLE "CustomerAddress"');
  const original = { addressLine1: '1 Synthetic Street', unitNumber: '4', buzzCode: '111', city: 'Guelph', province: 'ON' };
  const customer = await db.customer.create({ data: { fullName: 'Synthetic', normalizedFullName: 'synthetic', phone: '5195550101', normalizedPhone: '5195550101', ...original } });
  t.after(async () => { await db.customer.deleteMany({ where: { id: customer.id } }); await db.$disconnect(); });
  const sql = readFileSync('prisma/migrations/20261125190000_customer_saved_addresses/migration.sql', 'utf8');
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
  const first = await db.customerAddress.findFirst({ where: { customerId: customer.id } });
  assert.equal(first.label, 'Address 1'); assert.equal(first.isDefault, true); assert.equal(first.unitNumber, '4'); assert.equal(first.buzzCode, '111');
  const order = await db.order.create({ data: { customerId: customer.id, customerName: 'Synthetic', phone: '5195550101', email: 'synthetic@example.invalid', paymentMethod: 'CASH', itemsText: 'Synthetic item', ...original } });
  t.after(async () => { await db.order.deleteMany({ where: { id: order.id } }); });
  async function call(method, body, addressId) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
    await mutate({ method, body, params: { id: customer.id, addressId } }, res);
    assert.equal(res.code, 200); return res.value.addresses;
  }
  await Promise.all(Array.from({ length: 5 }, (_, i) => call('POST', { ...original, addressLine1: `${i + 2} Synthetic Street`, isDefault: true })));
  assert.equal(await db.customerAddress.count({ where: { customerId: customer.id, isDefault: true } }), 1);
  assert.equal(await db.customerAddress.count({ where: { customerId: customer.id } }), 6);
  assert.deepEqual((await db.customerAddress.findMany({ where: { customerId: customer.id }, orderBy: { label: 'asc' } })).map(a => a.label), Array.from({ length: 6 }, (_, i) => `Address ${i + 1}`));
  await assert.rejects(db.customerAddress.update({ where: { id: first.id }, data: { isDefault: true } }));
  const current = await db.customerAddress.findFirst({ where: { customerId: customer.id, isDefault: true } });
  await call('DELETE', undefined, current.id);
  assert.equal(await db.customerAddress.count({ where: { customerId: customer.id, isDefault: true } }), 1);
  await db.customer.update({ where: { id: customer.id }, data: { addressLine1: '99 New last-used Street' } });
  assert.equal((await db.customerAddress.findUnique({ where: { id: first.id } })).addressLine1, original.addressLine1);
  await call('PUT', { ...original, addressLine1: '100 Changed Street', isDefault: true }, first.id);
  assert.equal((await db.order.findUnique({ where: { id: order.id } })).addressLine1, original.addressLine1);
  await db.customer.delete({ where: { id: customer.id } });
  assert.equal(await db.customerAddress.count({ where: { customerId: customer.id } }), 0);
  assert.equal((await db.order.findUnique({ where: { id: order.id } })).addressLine1, original.addressLine1);
});
