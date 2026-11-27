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
});
