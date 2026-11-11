// Explicit cross-repository CI fixture entrypoint. Never mounted/imported by the application.
const assert = require('node:assert/strict');
assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.env.CUSTOMER_NOTIFICATION_CONTRACT_SERVER, 'synthetic-only');
const url = new URL(process.env.DATABASE_URL);
assert(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.equal(url.pathname, '/speedy_notification_synthetic'); assert.equal(url.username, 'privacy_test');
const express = require('express');
const { createHash } = require('node:crypto');
const { prisma: db } = require('../dist/lib/prisma');
const { customerNotificationMessage } = require('../dist/services/customerOrderNotification.service');
const app = express(); app.use(express.json());
app.use('/api/v1/customer-notifications', require('../dist/routes/customerNotification.routes').default);
const id = '11111111-1111-4111-8111-111111111111';
const credential = Buffer.alloc(32, 7).toString('base64url'); // Public synthetic fixture, never a live secret.
const name = 'Synthetic notification contract fixture';
const wrap = work => async (_req, res) => { try { res.json(await work()); } catch { res.status(500).json({ code: 'SYNTHETIC_FIXTURE_FAILED' }); } };
app.post('/fixture/reset', wrap(async () => {
  const prior = await db.order.findUnique({ where: { id }, select: { customerName: true } });
  assert(!prior || [name, 'Deleted synthetic fixture'].includes(prior.customerName));
  const data = { customerName: name, addressLine1: '1 Example Street', city: 'Guelph', province: 'ON', phone: '5190000000',
    email: 'fixture@example.invalid', itemsText: 'fixture', paymentMethod: 'CASH', orderStatus: 'OUT_FOR_DELIVERY',
    trackingTokenHash: createHash('sha256').update(credential).digest('hex'), trackingTokenExpiresAt: new Date(Date.now() + 48 * 3600_000),
    outForDeliveryAt: new Date(Date.now() - 1000), privacyErasedAt: null, fcmToken: null, fcmTokenMutationId: null, fcmTokenRevision: 0 };
  await db.order.upsert({ where: { id }, create: { id, ...data }, update: data });
  return { ready: true };
}));
app.post('/fixture/erase', wrap(async () => {
  await db.order.update({ where: { id }, data: { customerName: 'Deleted synthetic fixture', privacyErasedAt: new Date(),
    addressLine1: '', city: '', province: '', phone: '', email: '', itemsText: '', trackingTokenHash: null, trackingTokenExpiresAt: null,
    fcmToken: null, fcmTokenMutationId: null, fcmTokenRevision: { increment: 1 } } });
  return { erased: true };
}));
app.post('/fixture/revoke', wrap(async () => {
  await db.order.update({ where: { id }, data: { trackingTokenHash: null, trackingTokenExpiresAt: null } }); return { revoked: true };
}));
app.get('/fixture/state', wrap(async () => {
  const row = await db.order.findUniqueOrThrow({ where: { id } });
  return { revision: row.fcmTokenRevision, token: row.fcmToken, erased: row.privacyErasedAt !== null };
}));
app.get('/fixture/event', wrap(async () => {
  const row = await db.order.findUniqueOrThrow({ where: { id } });
  return customerNotificationMessage({ ...row, fcmToken: 'synthetic-render-only' }, 'ORDER_OUT_FOR_DELIVERY')?.data || {};
}));
app.get('/fixture/ready', (_req, res) => res.json({ ready: true }));
const server = app.listen(8123, '127.0.0.1', () => console.log('Synthetic notification contract server ready'));
process.on('SIGTERM', () => server.close(() => { void db.$disconnect().finally(() => process.exit()); }));
