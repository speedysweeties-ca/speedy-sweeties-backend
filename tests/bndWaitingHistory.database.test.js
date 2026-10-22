const test = require('node:test');
const assert = require('node:assert/strict');
const enabled = process.env.CHECK_BND_HISTORY_DATABASE === '1';

test('B&D history distinguishes observed claims, missing orders and monitoring gaps across restarts', { skip: !enabled }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/speedy_sweeties_ci');
  const { prisma } = require('../dist/lib/prisma.js');
  const { recordBndSnapshot } = require('../dist/services/bndWaitingHistory.service.js');
  const start = Date.parse('2026-10-22T16:00:00Z');
  const at = seconds => new Date(start + seconds * 1000);
  const row = (id, claimed = false) => ({ id, number: id, claimed });
  const periods = id => prisma.bndWaitingPeriod.findMany({ where: { orderId: id }, orderBy: { firstSeenAt: 'asc' } });
  const record = (seconds, orders) => recordBndSnapshot(orders, at(seconds));
  try {
    // All test data lives in the guarded disposable CI database.
    await prisma.bndWaitingPeriod.deleteMany();
    await prisma.bndMonitorCheck.deleteMany();
    await record(0, [row('slow'), row('boundary'), row('vanishes'), row('already-claimed', true)]);
    for (let seconds = 60; seconds <= 300; seconds += 60) {
      await record(seconds, [row('slow'), row('boundary'), row('vanishes')]);
    }
    assert.equal((await periods('slow'))[0].overFiveMinutesAt, null); // Exactly five is not over five.
    // Opening detected at 5m30s is not evidence of >5 waiting if the last positive check was at 5m.
    await record(330, [row('slow'), row('boundary', true)]);
    const [slow] = await periods('slow');
    assert.equal(slow.overFiveMinutesAt.toISOString(), at(330).toISOString());
    const [boundary] = await periods('boundary');
    assert.equal(boundary.endReason, 'CLAIMED');
    assert.equal(boundary.overFiveMinutesAt, null);
    assert.equal((await periods('vanishes'))[0].endReason, 'MISSING');
    assert.equal((await periods('already-claimed')).length, 0);
    await record(390, [row('slow', true), row('gap')]);
    const [claimed] = await periods('slow');
    assert.equal(claimed.endReason, 'CLAIMED');
    assert.equal(claimed.endObservedAt.toISOString(), at(390).toISOString());
    // New Prisma connection simulates a process restart; no in-memory timing is required.
    const { PrismaClient } = require('@prisma/client');
    const restarted = new PrismaClient();
    try { await recordBndSnapshot([row('gap')], at(450), restarted); }
    finally { await restarted.$disconnect(); }
    await record(900, [row('gap')]);
    let gap = await periods('gap');
    assert.equal(gap.length, 2);
    assert.equal(gap[0].endReason, 'GAP');
    assert.ok(gap.every(p => p.overFiveMinutesAt === null));
    await record(960, [row('gap', true)]);
    gap = await periods('gap');
    assert.equal(gap[1].endReason, 'CLAIMED');
    assert.ok(gap.every(p => p.overFiveMinutesAt === null));
    // Delayed/duplicate snapshots cannot reopen old orders or change their opening times.
    const checks = await prisma.bndMonitorCheck.count();
    await record(900, [row('slow'), row('gap')]);
    await record(960, [row('slow'), row('gap')]);
    assert.equal(await prisma.bndMonitorCheck.count(), checks);
    assert.equal((await periods('slow')).length, 1);
    await Promise.all([record(1020, [row('parallel')]), record(1020, [row('parallel')])]);
    assert.equal((await periods('parallel')).length, 1);
    // A real empty list ends waiting; it never invents a claim/opening.
    await record(1080, []);
    assert.equal((await periods('parallel'))[0].endReason, 'MISSING');
    const { readFileSync } = require('node:fs');
    const sql = file => readFileSync(file, 'utf8').replaceAll('MONDAY_DATE', '2026-10-19').replaceAll('SUNDAY_DATE', '2026-10-25');
    let report = await prisma.$queryRawUnsafe(sql('docs/bnd-weekly-report.sql'));
    assert.deepEqual(report.map(r => r.order_id), ['slow']);
    assert.equal(report[0].opening_detected_at.toISOString(), at(390).toISOString());
    assert.equal(report[0].confirmed_wait_seconds, 330);
    // First-observed dates and all observations respect the Sunday 6pm cutoff.
    await prisma.bndWaitingPeriod.createMany({ data: [
      { orderId: 'late-opening', orderNumber: 'late-opening', firstSeenAt: new Date('2026-10-25T21:50:00Z'),
        lastSeenWaitingAt: new Date('2026-10-25T21:56:00Z'), overFiveMinutesAt: new Date('2026-10-25T21:56:00Z'),
        endObservedAt: new Date('2026-10-25T22:01:00Z'), endReason: 'CLAIMED' },
      { orderId: 'outside-week', orderNumber: 'outside-week', firstSeenAt: new Date('2026-10-25T22:00:00Z'),
        lastSeenWaitingAt: new Date('2026-10-25T22:06:00Z'), overFiveMinutesAt: new Date('2026-10-25T22:06:00Z') },
    ] });
    report = await prisma.$queryRawUnsafe(sql('docs/bnd-weekly-report.sql'));
    assert.deepEqual(report.map(r => r.order_id), ['slow', 'late-opening']);
    assert.equal(report[1].opening_detected_at, null);
    const coverage = await prisma.$queryRawUnsafe(sql('docs/bnd-weekly-coverage.sql'));
    assert.equal(coverage.length, 7);
    assert.equal(coverage[0].successful_checks, 0);
    assert.equal(coverage[0].longest_gap_seconds, 11 * 3600);
    assert.equal(coverage[6].longest_gap_seconds, 8 * 3600);
    assert.equal(coverage[3].history_began_at.toISOString(), at(0).toISOString());
    await prisma.systemSetting.createMany({ data: [
      { key: 'bndHours:2026-10-25', value: JSON.stringify({ source: 'website', startAt: '2026-10-25T15:30:00Z', endAt: '2026-10-25T21:00:00Z' }) },
      { key: 'bndHours:2026-10-23', value: JSON.stringify({ source: 'website', startAt: null, endAt: null }) },
    ] });
    const publishedCoverage = await prisma.$queryRawUnsafe(sql('docs/bnd-weekly-coverage.sql'));
    assert.equal(publishedCoverage[6].expected_open_seconds, 5.5 * 3600);
    assert.equal(publishedCoverage[6].longest_gap_seconds, 5.5 * 3600);
    assert.equal(publishedCoverage[6].hours_source, 'website');
    assert.equal(publishedCoverage[4].expected_open_seconds, 0);
    assert.equal(publishedCoverage[4].longest_gap_seconds, 0);
    assert.equal(publishedCoverage[4].successful_checks, 0);
    assert.equal(publishedCoverage[0].hours_source, 'legacy');

  } finally {
    await prisma.systemSetting.deleteMany({ where: { key: { in: ['bndHours:2026-10-25', 'bndHours:2026-10-23'] } } });
    await prisma.bndWaitingPeriod.deleteMany();
    await prisma.bndMonitorCheck.deleteMany();
    await prisma.$disconnect();
  }
});
