const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBndPublicHours, createBndHoursProvider, BND_HOURS_URL } = require('../dist/integrations/bnd/hours.js');
const { BND_FALLBACK_HOURS, getBndHours, setBndHours, getBndSchedule, bndDayWindow, bndLocalDate } = require('../dist/integrations/bnd/schedule.js');
const { createBndMonitor } = require('../dist/integrations/bnd/monitor.js');
const at = s => Date.parse(s);
const json = body => new Response(JSON.stringify(body));
function feed(time, overrides = {}) {
  const window = bndDayWindow(bndLocalDate(time), BND_FALLBACK_HOURS);
  const clock = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
  return { closed_all_day: false, default_hours: BND_FALLBACK_HOURS.weekly.map(r => ({
    day_of_week: r.day, start_time: clock(r.startMinute), end_time: clock(r.endMinute),
    time_zone: 'America/New_York', closed_all_day: false,
  })), today_hours: { start_time: new Date(window.startAt + 170).toISOString(), end_time: new Date(window.endAt + 170).toISOString() }, ...overrides };
}
test('public daily overrides win over weekly hours, including holiday closure; invalid data is rejected', () => {
  const now = at('2026-10-25T14:00:00Z');
  const ordinary = parseBndPublicHours(feed(now), now);
  assert.equal(ordinary.today.startAt, at('2026-10-25T15:30:00Z')); // No incidental .170 seconds.
  assert.equal(ordinary.refreshAt, ordinary.today.startAt);
  const special = parseBndPublicHours(feed(now, { today_hours: {
    start_time: '2026-10-25T16:00:00Z', end_time: '2026-10-25T20:00:00Z',
  } }), now);
  assert.deepEqual(getBndSchedule(now, special), { open: false, nextChangeAt: at('2026-10-25T16:00:00Z') });
  assert.equal(getBndSchedule(at('2026-10-25T20:00:00Z'), special).open, false);
  const closed = parseBndPublicHours(feed(now, { closed_all_day: true, today_hours: null }), now);
  assert.deepEqual(getBndSchedule(at('2026-10-25T17:00:00Z'), closed), { open: false, nextChangeAt: at('2026-10-26T13:30:00Z') });
  assert.equal(closed.refreshAt, at('2026-10-26T04:00:00Z'));
  for (const bad of [null, {}, feed(now, { default_hours: [] }), feed(now, { closed_all_day: 'false' }),
    feed(now, { today_hours: { start_time: '2026-10-24T15:30:00Z', end_time: '2026-10-24T21:00:00Z' } }),
    feed(now, { today_hours: { start_time: '2026-10-25T21:00:00Z', end_time: '2026-10-25T15:30:00Z' } }),
    feed(now, { default_hours: Array(7).fill(feed(now).default_hours[0]) })]) {
    assert.throws(() => parseBndPublicHours(bad, now));
  }
});
test('hours refresh only at startup, opening and midnight; failed feed retains cache and retries', async t => {
  t.after(() => setBndHours(BND_FALLBACK_HOURS));
  let time = at('2026-10-25T13:00:00Z'), fail = false, requests = 0, errors = 0;
  const audits = [];
  const provider = createBndHoursProvider({ now: () => time, onError: () => { errors++; },
    fetchImpl: async (url, options) => {
      assert.equal(url, BND_HOURS_URL); assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.redirect, 'error'); requests++;
      if (fail) throw new Error('offline');
      return json(feed(time));
    }, save: async (hours, audit) => { audits.push(audit); assert.equal(hours.weekly.length, 7); } });
  await Promise.all([provider.refreshIfDue(), provider.refreshIfDue()]);
  assert.equal(requests, 1); assert.equal(getBndHours().source, 'website');
  assert.equal(provider.nextRefreshAt(), at('2026-10-25T15:30:00Z'));
  time += 60_000; await provider.refreshIfDue(); assert.equal(requests, 1);
  time = provider.nextRefreshAt(); fail = true; await provider.refreshIfDue();
  assert.equal(getBndHours().source, 'cached'); assert.equal(provider.nextRefreshAt(), time + 15 * 60_000);
  assert.equal(getBndSchedule(time).open, true); assert.equal(errors, 1);
  time = provider.nextRefreshAt(); fail = false; await provider.refreshIfDue();
  assert.equal(getBndHours().source, 'website'); assert.equal(provider.nextRefreshAt(), at('2026-10-26T04:00:00Z'));
  time = provider.nextRefreshAt(); await provider.refreshIfDue();
  assert.equal(audits.at(-1).date, '2026-10-26'); assert.equal(audits.at(-1).endAt, '2026-10-27T00:00:00.000Z');
});
test('restart uses durable validated hours during outage; yesterday holiday does not close today', async t => {
  t.after(() => setBndHours(BND_FALLBACK_HOURS));
  const saved = parseBndPublicHours(feed(at('2026-12-25T16:00:00Z'), { closed_all_day: true, today_hours: null }), at('2026-12-25T16:00:00Z'));
  const time = at('2026-12-26T16:00:00Z'); let audit;
  const provider = createBndHoursProvider({ now: () => time, load: async () => JSON.stringify(saved),
    fetchImpl: async () => json({ broken: true }), save: async (_h, a) => { audit = a; } });
  await provider.refreshIfDue();
  assert.equal(getBndHours().source, 'cached'); assert.equal(getBndSchedule(time).open, true);
  assert.equal(audit.date, '2026-12-26'); assert.equal(audit.startAt, '2026-12-26T14:30:00.000Z');
});
test('closed holiday makes no login/list calls and midnight refresh wakes the sleeping monitor', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: at('2026-10-25T17:00:00Z') });
  const reads = [];
  const provider = createBndHoursProvider({ fetchImpl: async url => {
    reads.push(url);
    return json(feed(Date.now(), bndLocalDate(Date.now()) === '2026-10-25' ? { closed_all_day: true, today_hours: null } : {}));
  } });
  let orders = 0;
  const monitor = createBndMonitor({ enabled: true, email: 'test', password: 'test',
    beforeCheck: provider.refreshIfDue, nextHoursRefreshAt: provider.nextRefreshAt,
    fetchImpl: async url => { orders++; return json(url.endsWith('login') ? { token: 'test' } : []); } });
  t.after(() => { monitor.stop(); setBndHours(BND_FALLBACK_HOURS); });
  monitor.start(); await new Promise(setImmediate);
  assert.equal(reads.length, 1); assert.equal(orders, 0); assert.equal(monitor.getStatus().state, 'paused');
  t.mock.timers.tick(at('2026-10-26T04:00:00Z') - Date.now()); await new Promise(setImmediate);
  assert.equal(reads.length, 2); assert.equal(orders, 0);
  t.mock.timers.tick(at('2026-10-26T13:30:00Z') - Date.now()); await new Promise(setImmediate);
  assert.equal(reads.length, 3); assert.equal(orders, 2); assert.equal(monitor.getStatus().state, 'connected');
});
