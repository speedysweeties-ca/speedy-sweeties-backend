const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { CustomerNotificationTokens, notificationMutationSchema } = require('../dist/services/customerNotificationToken.service');
const { customerNotificationMessage, createCustomerOrderNotifier, CUSTOMER_NOTIFICATION_TTL_MS } = require('../dist/services/customerOrderNotification.service');
const token = randomBytes(32).toString('base64url');
const id = randomUUID();
const row = () => ({ id, trackingTokenHash: createHash('sha256').update(token).digest('hex'),
  trackingTokenExpiresAt: new Date(Date.now() + 60_000), privacyErasedAt: null, fcmToken: 'synthetic-device',
  fcmTokenRevision: 0, fcmTokenMutationId: null, orderStatus: 'OUT_FOR_DELIVERY',
  createdAt: new Date(), outForDeliveryAt: new Date(), deliveredAt: new Date() });
function fixture() {
  let current = row(), writes = 0, locks = 0;
  const db = { order: {
    findUnique: async ({ where }) => where.id === id ? structuredClone(current) : null,
    update: async ({ data }) => { writes++; current = { ...current, ...data, fcmTokenRevision: current.fcmTokenRevision + data.fcmTokenRevision.increment }; return structuredClone(current); }
  } };
  db.$transaction = work => work({ ...db, $queryRaw: async () => { locks++; return [{ id }]; } });
  return { service: new CustomerNotificationTokens(db), current: () => current, writes: () => writes, locks: () => locks };
}
const mutation = (expectedRevision, fcmToken) => ({ expectedRevision, fcmToken, operationId: randomUUID() });

test('order-scoped mutation recovers a lost response and fences stale writes/removal', async () => {
  const f = fixture(), first = mutation(0, 'rotated-device');
  assert.deepEqual(await f.service.mutate(id, token, first), { revision: 1, registered: true });
  assert.deepEqual(await f.service.mutate(id, token, first), { revision: 1, registered: true });
  assert.equal(f.writes(), 1);
  await assert.rejects(f.service.mutate(id, token, { ...first, fcmToken: 'different' }), /NOTIFICATION_OPERATION_CONFLICT/);
  const remove = mutation(1, null);
  assert.deepEqual(await f.service.mutate(id, token, remove), { revision: 2, registered: false });
  await assert.rejects(f.service.mutate(id, token, first), /NOTIFICATION_REVISION_CONFLICT/);
  assert.equal(f.current().fcmToken, null);
  assert.equal(f.locks(), 5);
  assert(!JSON.stringify(await f.service.read(id, token)).includes(token));
});

test('removing an already empty association still fences an earlier registration', async () => {
  const f = fixture(); f.current().fcmToken = null;
  await f.service.mutate(id, token, mutation(0, null));
  await assert.rejects(f.service.mutate(id, token, mutation(0, 'old-late-device')), /NOTIFICATION_REVISION_CONFLICT/);
});

test('expiry, revocation, deletion, foreign IDs and unrelated credentials never authorize mutation', async () => {
  const f = fixture();
  for (const wrong of ['', id, '5190000000', 'person@example.invalid', 'Bearer staff.jwt', randomBytes(32).toString('base64url')]) {
    await assert.rejects(f.service.mutate(id, wrong, mutation(0, 'device')), /CUSTOMER_ORDER_ACCESS_REJECTED/);
  }
  await assert.rejects(f.service.read(randomUUID(), token), /CUSTOMER_ORDER_ACCESS_REJECTED/);
  f.current().trackingTokenExpiresAt = new Date(0);
  await assert.rejects(f.service.mutate(id, token, mutation(0, null)), /CUSTOMER_ORDER_ACCESS_REJECTED/);
  f.current().trackingTokenExpiresAt = new Date(Date.now() + 60_000); f.current().trackingTokenHash = null;
  await assert.rejects(f.service.mutate(id, token, mutation(0, null)), /CUSTOMER_ORDER_ACCESS_REJECTED/);
  f.current().trackingTokenHash = createHash('sha256').update(token).digest('hex'); f.current().privacyErasedAt = new Date();
  await assert.rejects(f.service.mutate(id, token, mutation(0, 'late-device')), /CUSTOMER_ORDER_ACCESS_REJECTED/);
  assert.equal(f.writes(), 0);
});

test('closed orders allow removal but no new association; input is explicit and strict', async () => {
  const f = fixture(); f.current().orderStatus = 'DELIVERED';
  await assert.rejects(f.service.mutate(id, token, mutation(0, 'device')), /NOTIFICATION_ORDER_CLOSED/);
  await f.service.mutate(id, token, mutation(0, null));
  for (const value of [{}, { ...mutation(0, 'device'), phone: 'not-auth' }, mutation(-1, 'x'), mutation(0, ''), mutation(0, 'a\nb')]) {
    assert.equal(notificationMutationSchema.safeParse(value).success, false);
  }
});

test('customer messages contain stable reference/freshness metadata and no receipt/access/customer content', () => {
  const order = { ...row(), customerName: 'private', trackingToken: token, receiptTotal: 987.65, addressLine1: 'private' };
  const first = customerNotificationMessage(order, 'ORDER_OUT_FOR_DELIVERY');
  const retry = customerNotificationMessage(order, 'ORDER_OUT_FOR_DELIVERY', Date.now() + 1000);
  assert.equal(first.data.eventId, retry.data.eventId);
  assert.equal(first.data.orderId, id);
  assert.equal(Number(first.data.expiresAtMillis) - Number(first.data.occurredAtMillis), CUSTOMER_NOTIFICATION_TTL_MS);
  assert.equal(first.data.status, 'OUT_FOR_DELIVERY');
  const visible = JSON.stringify({ ...first, token: undefined });
  for (const privateValue of [token, '987.65', 'private', 'synthetic-device']) assert(!visible.includes(privateValue));
  assert.equal(customerNotificationMessage({ ...order, privacyErasedAt: new Date() }, 'ORDER_OUT_FOR_DELIVERY'), null);
  assert.equal(customerNotificationMessage({ ...order, fcmToken: null }, 'ORDER_OUT_FOR_DELIVERY'), null);
  assert.equal(customerNotificationMessage(order, 'ORDER_OUT_FOR_DELIVERY', Date.now() + CUSTOMER_NOTIFICATION_TTL_MS + 1), null);
  assert.equal(customerNotificationMessage({ ...order, orderStatus: 'DELIVERED' }, 'ORDER_OUT_FOR_DELIVERY'), null);
});

test('sender rereads rotation/removal/deletion and invalid-token cleanup compares the exact failed token', async () => {
  let current = row(); const sent = [], cleared = [];
  const notify = createCustomerOrderNotifier({ findOrder: async () => current,
    send: async value => { sent.push(value); }, clearInvalidToken: async (...args) => cleared.push(args) });
  current.fcmToken = 'new-device'; await notify(id, 'ORDER_OUT_FOR_DELIVERY');
  assert.equal(sent[0].token, 'new-device');
  current.fcmToken = null; await notify(id, 'ORDER_OUT_FOR_DELIVERY');
  current.fcmToken = 'late-device'; current.privacyErasedAt = new Date(); await notify(id, 'ORDER_OUT_FOR_DELIVERY');
  assert.equal(sent.length, 1);
  current = row();
  const invalid = createCustomerOrderNotifier({ findOrder: async () => current, clearInvalidToken: async (...args) => cleared.push(args),
    send: async () => { throw { code: 'messaging/registration-token-not-registered' }; } });
  await invalid(id, 'ORDER_OUT_FOR_DELIVERY'); assert.deepEqual(cleared, [[id, 'synthetic-device']]);
});

test('mounted customer API requires Bearer order access and returns only safe metadata', async t => {
  const express = require('express'); const { prisma } = require('../dist/lib/prisma');
  const original = prisma.order.findUnique; prisma.order.findUnique = async ({ where }) => where.id === id ? row() : null;
  t.after(() => { prisma.order.findUnique = original; });
  const app = express(); app.use(express.json()); app.use('/customer-notifications', require('../dist/routes/customerNotification.routes').default);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/customer-notifications/orders/${id}/token`;
  const missing = await fetch(url); assert.equal(missing.status, 401);
  const valid = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(valid.status, 200); assert.equal(valid.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await valid.json(), { success: true, data: { revision: 0, registered: true } });
});
