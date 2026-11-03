const replaceForTest = (t, target, key, value) => { const original = target[key]; target[key] = value; t.after(() => { target[key] = original; }); };
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma } = require('../dist/lib/prisma');
const { env } = require('../dist/config/env');
const { dailyHoursSlot, evaluateBusinessHours } = require('../dist/services/businessHoursSchedule');
const service = require('../dist/services/businessHours.service');
const controller = require('../dist/controllers/business.controller');
const day = (d, h, m = 0) => ({ day: d, hour: h, minute: m });
const dated = (d, h, m = 0) => ({ date: { year: 2026, month: 11, day: d }, hour: h, minute: m });
const regular = { periods: [1,2,3,4,5,6].map(d => ({ open: day(d,9,30), close: day(d,21) })).concat([{ open: day(0,11), close: day(0,18) }]) };
const saved = () => ({ fetchedAt: '2026-11-03T08:00:00Z', placeId: 'synthetic-place', businessName: 'Synthetic', regularOpeningHours: regular });
const evaluate = (s, at) => evaluateBusinessHours(s, new Date(at));

test('saved schedule changes at opening/closing, including split shifts and midnight', () => {
  const s = saved();
  assert.equal(evaluate(s, '2026-11-03T14:29:00Z').isOpen, false);
  assert.equal(evaluate(s, '2026-11-03T14:30:00Z').isOpen, true);
  assert.equal(evaluate(s, '2026-11-04T02:00:00Z').isOpen, false);
  assert.match(evaluate(s, '2026-11-04T02:00:00Z').nextOpenText, /tomorrow at 9:30 AM/);
  s.regularOpeningHours = { periods: [{open:day(2,9),close:day(2,12)}, {open:day(2,17),close:day(3,2)}] };
  assert.equal(evaluate(s,'2026-11-03T18:00:00Z').isOpen,false);
  assert.equal(evaluate(s,'2026-11-04T06:59:00Z').isOpen,true);
  assert.equal(evaluate(s,'2026-11-04T07:00:00Z').isOpen,false);
});

test('dated special hours and explicit holiday closure override weekly hours without repeating next week', () => {
  const s = saved();
  s.currentOpeningHours = { periods: [{open:dated(4,12),close:dated(4,15)}] };
  assert.equal(evaluate(s,'2026-11-03T18:00:00Z').isOpen,false);
  assert.match(evaluate(s,'2026-11-03T18:00:00Z').nextOpenText,/tomorrow at 12:00 PM/);
  assert.equal(evaluate(s,'2026-11-04T17:00:00Z').isOpen,true);
  assert.equal(evaluate(s,'2026-11-04T20:00:00Z').isOpen,false);
  // On day 8, stale dated exceptions are not treated as this week's holidays.
  assert.equal(evaluate(s,'2026-11-10T18:00:00Z').isOpen,true);
  assert.equal(evaluate(s,'2026-11-10T18:00:00Z').stale,true);
  s.currentOpeningHours = { periods: [] };
  assert.equal(evaluate(s,'2026-11-03T18:00:00Z').isOpen,false);
});

test('24/7, Sunday rollover, invalid/missing schedules and never-open schedules', () => {
  const s = saved();
  s.regularOpeningHours = { periods: [{open:day(0,0)}] };
  assert.equal(evaluate(s,'2026-11-08T06:00:00Z').isOpen,true);
  s.regularOpeningHours = { periods: [{open:day(6,22),close:day(0,2)}] };
  assert.equal(evaluate(s,'2026-11-08T06:00:00Z').isOpen,true);
  assert.equal(evaluate(s,'2026-11-08T07:00:00Z').isOpen,false);
  s.regularOpeningHours = { periods: [{open:day(2,30),close:day(2,31)}] };
  assert.equal(evaluate(s,'2026-11-03T18:00:00Z'),null);
  s.regularOpeningHours = {};
  assert.equal(evaluate(s,'2026-11-03T18:00:00Z'),null);
  s.regularOpeningHours = {periods:[]};
  assert.equal(evaluate(s,'2026-11-03T18:00:00Z').isOpen,false);
});

test('daily slot is 03:00 Toronto across both DST changes and year boundary', () => {
  for (const [before, at, previous, next] of [
    ['2026-03-08T06:59:00Z','2026-03-08T07:00:00Z','2026-03-07','2026-03-08'],
    ['2026-11-01T07:59:00Z','2026-11-01T08:00:00Z','2026-10-31','2026-11-01'],
    ['2027-01-01T07:59:00Z','2027-01-01T08:00:00Z','2026-12-31','2027-01-01']
  ]) {
    assert.equal(dailyHoursSlot(new Date(before)), previous);
    assert.equal(dailyHoursSlot(new Date(at)), next);
  }
  assert.equal(dailyHoursSlot(new Date('2026-11-01T05:30:00Z')), '2026-10-31');
  assert.equal(dailyHoursSlot(new Date('2026-11-01T06:30:00Z')), '2026-10-31');
});

function harness(t) {
  const rows = new Map(); let calls = 0; let fail = false;
  const oldKey = env.GOOGLE_PLACES_API_KEY, oldId = env.GOOGLE_PLACE_ID;
  env.GOOGLE_PLACES_API_KEY = 'synthetic-only'; env.GOOGLE_PLACE_ID = 'synthetic-place';
  t.after(() => { env.GOOGLE_PLACES_API_KEY = oldKey; env.GOOGLE_PLACE_ID = oldId; });
  replaceForTest(t, prisma.systemSetting,'findUnique', async ({where}) => rows.has(where.key) ? {key:where.key,value:rows.get(where.key)} : null);
  replaceForTest(t, prisma.systemSetting,'upsert', async ({where,create,update}) => {
    rows.set(where.key, rows.has(where.key) ? update.value : create.value); return {};
  });
  replaceForTest(t, prisma,'$executeRaw', async (sql,key,slot) => {
    assert.match(sql.join('?'), /ON CONFLICT.*DO UPDATE/s);
    assert.match(sql.join('?'), /WHERE "SystemSetting"\."value" < EXCLUDED\."value"/);
    if ((rows.get(key) ?? '') >= slot) return 0;
    rows.set(key,slot); return 1;
  });
  replaceForTest(t, global,'fetch', async () => {
    calls++; if (fail) throw new Error('synthetic provider failure');
    return {ok:true,json:async()=>({id:'synthetic-place', regularOpeningHours:regular})};
  });
  return { rows, calls:()=>calls, fail:()=>{fail=true;} };
}

test('one durable Google attempt survives concurrent workers, repeated reads, restart and 3am boundary', async t => {
  const h = harness(t);
  const now = new Date('2026-11-03T08:00:00Z');
  const result = await Promise.all(Array.from({length:20},()=>service.refreshBusinessHours(now)));
  assert.equal(result.filter(Boolean).length,1);
  for (let i=0;i<500;i++) assert.equal((await controller.getCurrentBusinessStatus(new Date('2026-11-03T18:00:00Z'))).isOpen,true);
  assert.equal(h.calls(),1);
  delete require.cache[require.resolve('../dist/services/businessHours.service')];
  const restarted = require('../dist/services/businessHours.service');
  await restarted.refreshBusinessHours(new Date('2026-11-04T07:59:00Z'));
  assert.equal(h.calls(),1);
  await restarted.refreshBusinessHours(new Date('2026-11-04T08:00:00Z'));
  assert.equal(h.calls(),2);
});

test('failed refresh keeps the saved schedule and does not retry until the next slot', async t => {
  const h = harness(t);
  await service.refreshBusinessHours(new Date('2026-11-03T08:00:00Z'));
  h.fail();
  await service.refreshBusinessHours(new Date('2026-11-04T08:00:00Z'));
  await service.refreshBusinessHours(new Date('2026-11-04T12:00:00Z'));
  assert.equal(h.calls(),2);
  const result = await controller.getCurrentBusinessStatus(new Date('2026-11-04T18:00:00Z'));
  assert.equal(result.isOpen,true); assert.equal(result.hoursStale,true);
  assert.equal(result.source,'google_places');
  await service.refreshBusinessHours(new Date('2026-11-05T08:00:00Z'));
  assert.equal(h.calls(),3);
});

test('missing/corrupt cache and failed storage never cause customer checks to call Google', async t => {
  const h = harness(t);
  assert.equal((await controller.getCurrentBusinessStatus()).source,'fallback');
  h.rows.set('business-hours:schedule:synthetic-place','broken JSON');
  assert.equal((await controller.getCurrentBusinessStatus()).source,'fallback');
  assert.equal(h.calls(),0);
  replaceForTest(t, prisma,'$executeRaw',async()=>{throw new Error('synthetic storage unavailable');});
  await assert.rejects(service.refreshBusinessHours(new Date('2026-11-03T08:00:00Z')));
  assert.equal(h.calls(),0);
});
