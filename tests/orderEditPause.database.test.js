const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const enabled = process.env.CHECK_EDIT_PAUSE_DATABASE === '1';

test('editor leases and SQL duration work together in an isolated PostgreSQL database', { skip: !enabled }, async () => {
  // Fail closed if someone accidentally points this integration test at production.
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/speedy_sweeties_ci');
  const { prisma } = require('../dist/lib/prisma.js');
  const { updateOrderEditPause } = require('../dist/services/orderEditPause.service.js');
  const { dispatchWaitingMilliseconds } = require('../dist/services/dispatchTiming.js');
  const createdAt = new Date('2026-10-21T12:00:00Z');
  const at = seconds => new Date(createdAt.getTime() + seconds * 1000);
  const order = await prisma.order.create({ data: {
    customerName: 'CI only', addressLine1: 'CI address', city: 'Guelph', province: 'ON',
    phone: '0000000000', email: 'ci@example.invalid', itemsText: 'CI', paymentMethod: 'CASH', createdAt
  } });
  const action = (sessionId, verb, seconds, actorUserId = 'ci-editor') =>
    updateOrderEditPause({ orderId: order.id, actorUserId, sessionId, action: verb }, at(seconds));
  try {
    const a = randomUUID(), b = randomUUID();
    await action(a, 'start', 120);
    const overlap = await Promise.all([action(a, 'heartbeat', 140), action(b, 'start', 150)]);
    assert.ok(overlap.every(x => x.paused));
    await assert.rejects(() => action(a, 'heartbeat', 155, 'other-user'), /another editor/);
    await action(a, 'stop', 160);
    await action(a, 'stop', 170); // Duplicate close cannot extend credit.
    await action(b, 'stop', 180);
    let pauses = await prisma.orderEditPause.findMany({ where: { orderId: order.id } });
    assert.equal(dispatchWaitingMilliseconds(createdAt, at(300), pauses), 240000);
    const [sql] = await prisma.$queryRaw`
      SELECT EXTRACT(EPOCH FROM dispatch_edit_pause_duration(${order.id}, ${createdAt}::timestamp, ${at(300)}::timestamp))::float8 AS seconds
    `;
    assert.equal(sql.seconds, 60); // 120..180 union, not 70 seconds summed.
    const stopped = randomUUID();
    await action(stopped, 'stop', 200);
    assert.equal((await action(stopped, 'start', 210)).paused, false);
    const expired = randomUUID();
    await action(expired, 'start', 220);
    await assert.rejects(() => action(expired, 'heartbeat', 280), /expired/);
    await action(expired, 'stop', 300);
    assert.equal((await prisma.orderEditPause.findUnique({ where: { id: expired } })).endedAt.toISOString(), at(265).toISOString());
    await prisma.order.update({ where: { id: order.id }, data: { dispatchedAt: at(250), orderStatus: 'DISPATCHED' } });
    assert.equal((await action(randomUUID(), 'start', 310)).paused, false);
    pauses = await prisma.orderEditPause.findMany({ where: { orderId: order.id } });
    const [clipped] = await prisma.$queryRaw`
      SELECT EXTRACT(EPOCH FROM dispatch_edit_pause_duration(${order.id}, ${createdAt}::timestamp, ${at(250)}::timestamp))::float8 AS seconds
    `;
    assert.equal(clipped.seconds, 90);
    assert.equal(dispatchWaitingMilliseconds(createdAt, at(250), pauses), 160000);
  } finally {
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.$disconnect();
  }
});
