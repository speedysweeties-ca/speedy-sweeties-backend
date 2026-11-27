const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('receipt item fingerprint migration and reopen validity on isolated PostgreSQL', {
  skip: process.env.CHECK_RECEIPT_ITEMS_DATABASE !== 'yes'
}, async t => {
  assert.equal(process.env.NODE_ENV, 'test');
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/speedy_receipts_synthetic');
  const { prisma: db } = require('../dist/lib/prisma');
  const { createOrUpdateReceiptController: save } = require('../dist/controllers/receipt.controller');
  const { receiptMatchesItems } = require('../dist/services/receiptItems.service');
  t.after(async () => { await db.$disconnect(); });
  // Dedicated disposable CI database; exercise the actual additive migration.
  await db.$executeRawUnsafe('ALTER TABLE "DigitalReceipt" DROP COLUMN "itemsFingerprint"');
  await db.$executeRawUnsafe(readFileSync('prisma/migrations/20261127035000_receipt_items_fingerprint/migration.sql', 'utf8'));
  const driver = await db.user.create({ data: { email: 'receipt-driver@example.invalid', passwordHash: 'synthetic-only', role: 'DRIVER', firstName: 'Synthetic', lastName: 'Driver' } });
  const order = await db.order.create({ data: {
    customerName: 'Synthetic', addressLine1: '1 Synthetic Street', city: 'Guelph', province: 'ON', phone: '5195550100', email: 'synthetic@example.invalid',
    itemsText: 'Item A, Item B', paymentMethod: 'CASH', orderStatus: 'OUT_FOR_DELIVERY', assignedDriverId: driver.id,
    items: { create: [{ name: 'Item A', quantity: 1, price: 30 }, { name: 'Item B', quantity: 1, price: 10 }] }
  }, include: { items: true } });
  const expectedItems = order.items.map(({ id, name, quantity }) => ({ id, name, quantity }));
  const body = { itemTotal: 40, deliveryCharge: 22.02, taxOrFees: 0, grandTotal: 62.02, expectedItems };
  const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
  const call = async () => { const res = response(); await save({ params: { id: order.id }, user: { userId: driver.id, role: 'DRIVER' }, body }, res); return res; };
  assert.equal((await call()).statusCode, 200);
  const saved = await db.digitalReceipt.findUniqueOrThrow({ where: { orderId: order.id } });
  assert.ok(receiptMatchesItems(saved.itemsFingerprint, expectedItems));
  await db.orderItem.delete({ where: { id: expectedItems[1].id } });
  const current = await db.orderItem.findMany({ where: { orderId: order.id } });
  assert.equal(receiptMatchesItems(saved.itemsFingerprint, current), false);
  assert.equal((await call()).statusCode, 409);
  const after = await db.digitalReceipt.findUniqueOrThrow({ where: { orderId: order.id } });
  assert.equal(after.grandTotal.toString(), '62.02');
  assert.equal(after.updatedAt.toISOString(), saved.updatedAt.toISOString());

  // A delivery/cancellation commits while a receipt request waits on its row.
  // Verify actual PostgreSQL blocking, rather than relying on a timing guess.
  for (const role of ['DRIVER', 'ADMIN', 'DISPATCHER']) {
    for (const status of ['DELIVERED', 'CANCELLED']) {
      await t.test(`${role} late save waits for ${status} and preserves the receipt`, async () => {
        await db.order.update({ where: { id: order.id }, data: { orderStatus: 'OUT_FOR_DELIVERY' } });
        const before = await db.digitalReceipt.findUniqueOrThrow({ where: { orderId: order.id } });
        const req = { params: { id: order.id }, user: { userId: driver.id, role }, body: {
          itemTotal: 50, deliveryCharge: 22.02, taxOrFees: 0, grandTotal: 72.02,
          notes: 'Late edit must not persist',
          expectedItems: current.map(({ id, name, quantity }) => ({ id, name, quantity }))
        } };
        let pending;
        const res = response();
        try {
          await db.$transaction(async tx => {
            const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
            await tx.order.update({ where: { id: order.id }, data: { orderStatus: status } });
            pending = save(req, res);
            pending.catch(() => {});
            let blocked = false;
            const deadline = Date.now() + 5000;
            while (Date.now() < deadline) {
              // pg_locks is current; pg_stat_activity may cache a snapshot that
              // omits the receipt connection first opened during this transaction.
              const waiters = await tx.$queryRaw`
                SELECT pid FROM pg_locks
                WHERE NOT granted AND ${pid} = ANY(pg_blocking_pids(pid))
              `;
              if (waiters.length) { blocked = true; break; }
              await new Promise(resolve => setTimeout(resolve, 20));
            }
            assert.equal(blocked, true, 'receipt save must wait for the final-status writer');
          }, { timeout: 15000 });
        } finally {
          if (pending) await pending;
        }
        assert.equal(res.statusCode, 409);
        assert.equal(res.body.code, 'FINAL_RECEIPT_LOCKED');
        // A repeated request after completion must also be refused.
        const repeated = response();
        await save(req, repeated);
        assert.equal(repeated.body.code, 'FINAL_RECEIPT_LOCKED');
        assert.deepEqual(await db.digitalReceipt.findUniqueOrThrow({ where: { orderId: order.id } }), before);
        assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).orderStatus, status);
      });
    }
  }

});
