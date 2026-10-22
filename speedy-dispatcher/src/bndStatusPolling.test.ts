import assert from "node:assert/strict";
import test from "node:test";
import { createBndStatusPolling } from "./bndStatusPolling.ts";

function fixture() {
  const requests: string[] = [];
  let snapshots = 0;
  let failures = 0;
  const polling = createBndStatusPolling({
    url: "https://example.invalid/bnd-alerts/status", token: "test-token",
    onSnapshot: () => { snapshots++; }, onFailure: () => { failures++; }, onTick: () => {},
    fetchImpl: async url => {
      requests.push(String(url));
      return new Response(JSON.stringify({ state: "connected", pendingOrders: [],
        lastCheckedAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(),
        nextCheckAt: new Date(Date.now() + 60_000).toISOString(), errorCode: null }));
    },
  });
  return { polling, requests, snapshots: () => snapshots, failures: () => failures };
}

test("overnight browser load and tab refocus make no requests; Sunday 11:30 a.m. resumes automatically", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.parse("2026-10-18T01:00:00Z") });
  const h = fixture(); t.after(() => h.polling.stop());
  await h.polling.poll(); await h.polling.poll();
  t.mock.timers.tick(14.5 * 60 * 60_000 - 1);
  await new Promise(setImmediate);
  assert.equal(h.requests.length, 0);
  t.mock.timers.tick(1);
  await new Promise(setImmediate);
  assert.equal(h.requests.length, 1);
  assert.equal(h.snapshots(), 1);
  t.mock.timers.tick(10_000);
  await new Promise(setImmediate);
  assert.equal(h.requests.length, 2);
});

test("daytime polling stops precisely at 9 p.m. and logout prevents morning requests", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.parse("2026-10-18T00:59:55Z") });
  const h = fixture(); t.after(() => h.polling.stop());
  await h.polling.poll(); assert.equal(h.requests.length, 1);
  t.mock.timers.tick(5_000);
  await new Promise(setImmediate);
  await h.polling.poll(); // tab refocus after closing
  assert.equal(h.requests.length, 1);
  assert.equal(h.failures(), 0);
  h.polling.stop();
  t.mock.timers.tick(14.5 * 60 * 60_000);
  await new Promise(setImmediate);
  assert.equal(h.requests.length, 1);
});

test("a status request still running at closing is aborted without an outage warning", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.parse("2026-10-18T00:59:59Z") });
  let aborted = false;
  let failures = 0;
  const polling = createBndStatusPolling({ url: "https://example.invalid/status", token: "test",
    onSnapshot: () => assert.fail("late reply"), onFailure: () => { failures++; }, onTick: () => {},
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); });
    }) });
  t.after(() => polling.stop());
  const pending = polling.poll(); t.mock.timers.tick(1000); await pending;
  assert.equal(aborted, true); assert.equal(failures, 0);
});

test("published holiday hours stop status traffic and refresh at the next local day", async t => {
  const { BND_FALLBACK_HOURS, setBndHours } = await import('./bndSchedule.ts');
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.parse('2026-10-25T16:00:00Z') });
  const requests: string[] = [];
  const polling = createBndStatusPolling({ url: 'https://example.invalid/status', hoursUrl: 'https://example.invalid/hours', token: 'test',
    onSnapshot: () => {}, onFailure: () => assert.fail('closed hours are not an outage'), onTick: () => {},
    fetchImpl: async url => {
      requests.push(String(url));
      if (String(url).endsWith('/hours')) return new Response(JSON.stringify({ ...BND_FALLBACK_HOURS,
        source: 'website', checkedAt: Date.now(), refreshAt: Date.parse('2026-10-26T04:00:00Z'),
        today: { date: '2026-10-25', startAt: null, endAt: null },
      }));
      throw new Error('Must not read order status on a closed day');
    } });
  t.after(() => { polling.stop(); setBndHours(BND_FALLBACK_HOURS); });
  await polling.poll(); await polling.poll();
  assert.deepEqual(requests, ['https://example.invalid/hours']);
  t.mock.timers.tick(12 * 60 * 60_000 + 3000); await new Promise(setImmediate);
  assert.deepEqual(requests, ['https://example.invalid/hours', 'https://example.invalid/hours']);
});

test("browser applies today's special opening before deciding whether to read status", async t => {
  const { BND_FALLBACK_HOURS, setBndHours } = await import('./bndSchedule.ts');
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.parse('2026-10-25T14:00:00Z') });
  const requests: string[] = [];
  const polling = createBndStatusPolling({ url: 'https://example.invalid/status', hoursUrl: 'https://example.invalid/hours', token: 'test',
    onSnapshot: () => {}, onFailure: () => assert.fail('unexpected failure'), onTick: () => {},
    fetchImpl: async url => {
      requests.push(String(url));
      if (String(url).endsWith('/hours')) return new Response(JSON.stringify({ ...BND_FALLBACK_HOURS,
        source: 'website', checkedAt: Date.now(), refreshAt: Date.parse('2026-10-26T04:00:00Z'),
        today: { date: '2026-10-25', startAt: Date.parse('2026-10-25T14:00:00Z'), endAt: Date.parse('2026-10-25T16:00:00Z') },
      }));
      return new Response(JSON.stringify({ state: 'connected', pendingOrders: [], lastCheckedAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(), nextCheckAt: new Date(Date.now() + 60_000).toISOString(), errorCode: null }));
    } });
  t.after(() => { polling.stop(); setBndHours(BND_FALLBACK_HOURS); });
  await polling.poll();
  assert.deepEqual(requests, ['https://example.invalid/hours', 'https://example.invalid/status']);
  t.mock.timers.tick(10_000); await new Promise(setImmediate);
  assert.equal(requests.length, 3); assert.ok(requests[2].endsWith('/status'));
});
