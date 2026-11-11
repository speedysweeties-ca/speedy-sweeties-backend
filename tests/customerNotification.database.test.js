const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
test('notification concurrency and erasure on isolated PostgreSQL', { skip: process.env.CHECK_CUSTOMER_NOTIFICATION_DATABASE !== '1' }, async t => {
  assert.equal(process.env.NODE_ENV, 'test');
  const url = new URL(process.env.DATABASE_URL);
  assert(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/speedy_notification_synthetic'); assert.equal(url.username, 'privacy_test');
  const { prisma: db } = require('../dist/lib/prisma');
  const { CustomerNotificationTokens } = require('../dist/services/customerNotificationToken.service');
  const service = new CustomerNotificationTokens(db), created = [];
  const seed = async () => {
    const token = randomBytes(32).toString('base64url');
    const order = await db.order.create({ data: { customerName: 'Synthetic fixture', addressLine1: '1 Example Street',
      city: 'Guelph', province: 'ON', phone: '5190000000', email: 'fixture@example.invalid', itemsText: 'fixture', paymentMethod: 'CASH',
      trackingTokenHash: createHash('sha256').update(token).digest('hex'), trackingTokenExpiresAt: new Date(Date.now() + 60_000) } });
    created.push(order.id); return { id: order.id, token };
  };
  const input = (expectedRevision, fcmToken) => ({ expectedRevision, fcmToken, operationId: randomUUID() });
  async function whileLocked(f, change, run) {
    let release, locked; const gate = new Promise(resolve => { release = resolve; }), ready = new Promise(resolve => { locked = resolve; });
    const holder = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${f.id} FOR UPDATE`; locked(); await gate; await change(tx); }, { timeout: 10_000 });
    await ready; const result = run(); result.catch(() => {});
    try {
      let observed = false;
      for (let n = 0; n < 150; n++) {
        const [state] = await db.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Order"%FOR UPDATE%'`;
        if (state.count > 0) { observed = true; break; } await delay(10);
      }
      assert(observed, 'mutation must actually wait on the PostgreSQL row lock');
    } finally { release(); await holder; }
    return result;
  }
  try {
    await t.test('concurrent rotations accept one revision and idempotent replay writes once', async () => {
      const f = await seed(), a = input(0, 'device-a'), b = input(0, 'device-b');
      const results = await Promise.allSettled([service.mutate(f.id, f.token, a), service.mutate(f.id, f.token, b)]);
      assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
      assert.equal(results.find(x => x.status === 'rejected').reason.code, 'NOTIFICATION_REVISION_CONFLICT');
      const winner = results[0].status === 'fulfilled' ? a : b;
      assert.equal((await service.mutate(f.id, f.token, winner)).revision, 1);
      await service.mutate(f.id, f.token, input(1, null));
      await assert.rejects(service.mutate(f.id, f.token, winner), /NOTIFICATION_REVISION_CONFLICT/);
      assert.equal((await db.order.findUnique({ where: { id: f.id } })).fcmToken, null);
    });
    await t.test('public routing reference cannot open legacy UUID tracking or authorize mutation', async () => {
      const f = await seed(); const { customerNotificationReference } = require('../dist/utils/customerNotificationReference');
      const reference = customerNotificationReference(f.id);
      const { getPublicOrderTrackingController } = require('../dist/controllers/order.controller');
      const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
      await getPublicOrderTrackingController({ params: { id: reference } }, res); assert.equal(res.code, 404);
      await assert.rejects(service.mutate(f.id, reference, input(0, 'device')), /CUSTOMER_ORDER_ACCESS_REJECTED/);
      assert.equal((await service.read(f.id, f.token)).orderReference, reference);
    });
    await t.test('expiry is rechecked after a real row-lock wait', async () => {
      const f = await seed(), expiry = new Date(Date.now() + 250);
      await db.order.update({ where: { id: f.id }, data: { trackingTokenExpiresAt: expiry } });
      await assert.rejects(whileLocked(f, async () => { await delay(Math.max(0, expiry.getTime() - Date.now()) + 30); },
        () => service.mutate(f.id, f.token, input(0, 'late-device'))), /CUSTOMER_ORDER_ACCESS_REJECTED/);
    });
    for (const erased of [false, true]) await t.test(erased ? 'deletion wins against a queued late registration' : 'revocation wins against a queued late registration', async () => {
      const f = await seed();
      await assert.rejects(whileLocked(f, tx => tx.order.update({ where: { id: f.id }, data: {
        trackingTokenHash: null, ...(erased ? { privacyErasedAt: new Date(), fcmToken: null, fcmTokenMutationId: null, fcmTokenRevision: { increment: 1 } } : {})
      } }), () => service.mutate(f.id, f.token, input(0, 'late-device'))), /CUSTOMER_ORDER_ACCESS_REJECTED/);
      assert.equal((await db.order.findUnique({ where: { id: f.id } })).fcmToken, null);
    });
    await t.test('mutation before deletion is subsequently cleared; old credential can never reattach', async () => {
      const f = await seed(); await service.mutate(f.id, f.token, input(0, 'device'));
      await db.order.update({ where: { id: f.id }, data: { privacyErasedAt: new Date(), fcmToken: null, trackingTokenHash: null,
        fcmTokenRevision: { increment: 1 }, fcmTokenMutationId: null } });
      await assert.rejects(service.mutate(f.id, f.token, input(2, 'late-device')), /CUSTOMER_ORDER_ACCESS_REJECTED/);
      const saved = await db.order.findUnique({ where: { id: f.id } }); assert.equal(saved.fcmToken, null); assert.equal(saved.fcmTokenMutationId, null);
    });
  } finally { await db.order.deleteMany({ where: { id: { in: created } } }); await db.$disconnect(); }
});
