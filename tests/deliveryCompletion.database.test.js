const test = require('node:test');
const assert = require('node:assert/strict');

test('delivery acknowledgement, loyalty rollback and concurrent retries on isolated PostgreSQL', {
  skip: process.env.CHECK_RECEIPT_ITEMS_DATABASE !== 'yes'
}, async t => {
  assert.equal(process.env.NODE_ENV, 'test');
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/speedy_receipts_synthetic');
  const { prisma: db } = require('../dist/lib/prisma');
  const { driverActionController: deliver } = require('../dist/controllers/driverAction.controller');
  const { getCurrentLoyaltyMonth } = require('../dist/services/loyalty.service');
  const notifications = require('../dist/services/customerOrderNotification.service');
  const originalSend = notifications.sendCustomerOrderNotification;
  let sends = 0;
  let failNotification = false;
  notifications.sendCustomerOrderNotification = async () => {
    sends++;
    if (failNotification) throw new Error('synthetic notification outage');
  };
  t.after(async () => { notifications.sendCustomerOrderNotification = originalSend; await db.$disconnect(); });
  const driver = await db.user.create({ data: { email: 'completion-driver@example.invalid', passwordHash: 'synthetic-only', role: 'DRIVER', firstName: 'Synthetic', lastName: 'Driver' } });
  const other = await db.user.create({ data: { email: 'other-completion-driver@example.invalid', passwordHash: 'synthetic-only', role: 'DRIVER', firstName: 'Other', lastName: 'Driver' } });
  let sequence = 0;
  async function fixture() {
    sequence++;
    const customer = await db.customer.create({ data: {
      fullName: 'Synthetic Completion', normalizedFullName: 'synthetic completion',
      phone: `51955501${String(sequence).padStart(2, '0')}`, normalizedPhone: `51955501${String(sequence).padStart(2, '0')}`,
      addressLine1: '1 Synthetic Street', city: 'Guelph', province: 'ON', loyaltyProgressMonth: getCurrentLoyaltyMonth()
    } });
    const order = await db.order.create({ data: {
      customerName: 'Synthetic Completion', addressLine1: '1 Synthetic Street', city: 'Guelph', province: 'ON', phone: customer.phone, email: 'completion@example.invalid',
      itemsText: 'Synthetic item', paymentMethod: 'CASH', orderStatus: 'OUT_FOR_DELIVERY', orderSource: 'ANDROID_APP',
      customerId: customer.id, assignedDriverId: driver.id,
      digitalReceipt: { create: { receiptNumber: `completion-${sequence}`, createdByDriverId: driver.id,
        itemTotal: 10, deliveryCharge: 12, taxOrFees: 0, grandTotal: 22 } }
    } });
    return { customer, order };
  }
  async function call(orderId, userId = driver.id) {
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
    await deliver({ params: { id: orderId }, body: { action: 'DELIVERED' }, user: { userId, role: 'DRIVER' } }, res);
    return res;
  }

  await t.test('concurrent retries confirm one timestamp, one credit and one notification', async () => {
    const { order, customer } = await fixture();
    const startSends = sends;
    const responses = await Promise.all(Array.from({ length: 8 }, () => call(order.id)));
    assert.ok(responses.every(r => r.statusCode === 200 && r.body.order.id === order.id && r.body.order.orderStatus === 'DELIVERED'));
    assert.equal(responses.filter(r => !r.body.alreadyCompleted).length, 1);
    assert.equal(new Set(responses.map(r => r.body.order.deliveredAt.toISOString())).size, 1);
    assert.equal((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).loyaltyCompletedOrders, 1);
    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal((await call(order.id)).body.alreadyCompleted, true);
    assert.deepEqual(await db.order.findUniqueOrThrow({ where: { id: order.id } }), saved);
    assert.equal(sends - startSends, 1);
    assert.equal((await call(order.id, other.id)).statusCode, 403);
  });

  await t.test('failed loyalty write rolls back delivery; retry safely saves both', async () => {
    const { order, customer } = await fixture();
    const beforeReceipt = await db.digitalReceipt.findUniqueOrThrow({ where: { orderId: order.id } });
    const startSends = sends;
    await db.$executeRawUnsafe(`CREATE FUNCTION completion_credit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic credit write failure'; END; $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER completion_credit_fail BEFORE UPDATE ON "Customer" FOR EACH ROW EXECUTE FUNCTION completion_credit_fail()');
    try { await assert.rejects(call(order.id), /synthetic credit write failure/); }
    finally {
      await db.$executeRawUnsafe('DROP TRIGGER completion_credit_fail ON "Customer"');
      await db.$executeRawUnsafe('DROP FUNCTION completion_credit_fail()');
    }
    const failed = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(failed.orderStatus, 'OUT_FOR_DELIVERY');
    assert.equal(failed.deliveredAt, null);
    assert.equal((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).loyaltyCompletedOrders, 0);
    assert.deepEqual(await db.digitalReceipt.findUniqueOrThrow({ where: { orderId: order.id } }), beforeReceipt);
    assert.equal(sends, startSends);
    assert.equal((await call(order.id)).statusCode, 200);
    assert.equal((await call(order.id)).body.alreadyCompleted, true);
    assert.equal((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).loyaltyCompletedOrders, 1);
  });

  for (const change of ['cancel', 'reassign']) {
    await t.test(`${change} winning the row lock prevents a stale completion`, async () => {
      const { order, customer } = await fixture();
      let pending;
      let response;
      try {
        await db.$transaction(async tx => {
          const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
          await tx.order.update({ where: { id: order.id }, data: change === 'cancel' ? { orderStatus: 'CANCELLED' } : { assignedDriverId: other.id } });
          pending = call(order.id).then(r => { response = r; });
          pending.catch(() => {});
          let blocked = false;
          const deadline = Date.now() + 3000;
          while (Date.now() < deadline) {
            const locks = await tx.$queryRaw`SELECT pid FROM pg_locks WHERE NOT granted AND ${pid} = ANY(pg_blocking_pids(pid))`;
            if (locks.length) { blocked = true; break; }
            await new Promise(resolve => setTimeout(resolve, 20));
          }
          assert.equal(blocked, true);
        }, { timeout: 10000 });
      } finally { if (pending) await pending; }
      assert.equal(response.statusCode, change === 'cancel' ? 409 : 403);
      assert.equal((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).loyaltyCompletedOrders, 0);
    });
  }

  await t.test('notification outage does not turn a committed delivery into a failed action', async () => {
    const { order } = await fixture();
    const startSends = sends;
    failNotification = true;
    try {
      assert.equal((await call(order.id)).statusCode, 200);
      assert.equal((await call(order.id)).body.alreadyCompleted, true);
      assert.equal(sends - startSends, 1);
    } finally { failNotification = false; }
  });

  await t.test('missing order and missing receipt stay refused', async () => {
    assert.equal((await call('not-a-real-order')).statusCode, 404);
    const { order } = await fixture();
    await db.digitalReceipt.delete({ where: { orderId: order.id } });
    const result = await call(order.id);
    assert.equal(result.statusCode, 409);
    assert.equal(result.body.code, 'RECEIPT_REQUIRED');
  });
});
