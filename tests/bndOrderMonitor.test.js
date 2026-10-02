const assert = require("node:assert/strict");
const test = require("node:test");
const { createBndMonitor, parseBndOrders, BND_POLL_MS } = require("../dist/integrations/bnd/monitor.js");

const row = (id, claimed = false) => ({ id, number_id: 468000 + id, is_en_route: claimed,
  order_account: { phone: "private-customer-phone" }, order_address: { address1: "private-address" } });
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
function fixture(handlers = []) {
  let time = Date.parse("2026-10-02T20:00:00Z");
  const requests = [];
  const monitor = createBndMonitor({ enabled: true, email: "shared@example.invalid", password: "test-secret",
    now: () => time, fetchImpl: async (url, init) => {
      requests.push({ url, init });
      const next = handlers.shift();
      if (!next) throw new Error("Unexpected upstream request");
      return typeof next === "function" ? next(url, init) : next;
    } });
  return { monitor, requests, advance: (ms = BND_POLL_MS) => { time += ms; } };
}

test("disabled or unconfigured monitors never contact B&D", async () => {
  for (const [options, expected] of [
    [{ enabled: false, email: "user", password: "secret" }, "disabled"],
    [{ enabled: true, email: "", password: "secret" }, "unconfigured"],
    [{ enabled: true, email: "user", password: "" }, "unconfigured"],
  ]) {
    let calls = 0;
    const monitor = createBndMonitor({ ...options, fetchImpl: async () => { calls++; throw new Error(); } });
    monitor.start(); await monitor.check(); monitor.stop();
    assert.equal(calls, 0); assert.equal(monitor.getStatus().state, expected);
  }
});

test("only login and list requests; snapshots expose no credentials or customer details", async () => {
  const { monitor, requests } = fixture([json({ token: "session-one" }), json([row(1), row(2, true)])]);
  await monitor.check();
  assert.deepEqual(requests.map(r => [r.url, r.init.method]), [
    ["https://api.bddeliveries.ca/api/account/login", "POST"],
    ["https://api.bddeliveries.ca/api/driver/order", "GET"],
  ]);
  assert.deepEqual(JSON.parse(requests[0].init.body), { email: "shared@example.invalid", password: "test-secret" });
  assert.equal(requests[1].init.headers.Authorization, "Bearer session-one");
  assert.equal(requests[1].init.body, undefined);
  assert.ok(requests.every(r => r.init.redirect === "error"));
  assert.deepEqual(monitor.getStatus().pendingOrders, [{ id: "1", number: "468001" }]);
  assert.doesNotMatch(JSON.stringify(monitor.getStatus()), /test-secret|session-one|private-|example.invalid/);
  monitor.getStatus().pendingOrders.pop();
  assert.equal(monitor.getStatus().pendingOrders.length, 1);
  for (let i = 0; i < 100; i++) monitor.getStatus();
  assert.equal(requests.length, 2);
});

test("waiting calls remain across checks and clear only after a valid claimed/removed snapshot", async () => {
  const { monitor, requests, advance } = fixture([
    json({ token: "session" }), json([row(1), row(2)]), json([row(1), row(2)]),
    json([row(1, true), row(2), row(3)]), json([]),
  ]);
  await monitor.check(); assert.equal(monitor.getStatus().pendingOrders.length, 2);
  await monitor.check(); assert.equal(requests.length, 2); // enforce upstream cadence
  advance(); await monitor.check(); assert.equal(monitor.getStatus().pendingOrders.length, 2);
  advance(); await monitor.check(); assert.deepEqual(monitor.getStatus().pendingOrders.map(o => o.id), ["2", "3"]);
  advance(); await monitor.check(); assert.equal(monitor.getStatus().pendingOrders.length, 0);
  assert.equal(requests.filter(r => r.init.method === "POST").length, 1);
});

test("unexpected list shapes never become a false empty queue", () => {
  assert.deepEqual(parseBndOrders([row(1, 0), row(2, 1)]), [{ id: "1", number: "468001" }]);
  for (const bad of [null, {}, { orders: [] }, [null], [{ id: 1, number_id: 2 }],
    [row(1, "false")], [row(1, null)], [row(1), row(1)], [{ ...row(1), id: -2 }]]) {
    assert.throws(() => parseBndOrders(bad));
  }
});

test("malformed responses and connection failures retain waiting calls with a warning", async () => {
  for (const bad of [json({ error: "private-detail" }), new Response("not JSON"), json({}, 500),
    json([], 200, { "content-length": "999999999" }), () => { throw new Error("private-detail"); }]) {
    const { monitor, advance } = fixture([json({ token: "session" }), json([row(1)]), bad, json([])]);
    await monitor.check(); advance(); await monitor.check();
    assert.equal(monitor.getStatus().state, "error");
    assert.equal(monitor.getStatus().pendingOrders.length, 1);
    assert.doesNotMatch(JSON.stringify(monitor.getStatus()), /private-detail/);
    advance(); await monitor.check(); assert.equal(monitor.getStatus().state, "connected");
    assert.equal(monitor.getStatus().pendingOrders.length, 0);
  }
});

test("expired sessions refresh once and continue reading without claiming", async () => {
  const { monitor, advance, requests } = fixture([
    json({ token: "old-token" }), json([row(1)]), json({}, 401),
    json({ token: "new-token" }), json([row(1, true)]),
  ]);
  await monitor.check(); advance(); await monitor.check();
  assert.equal(monitor.getStatus().state, "connected");
  assert.equal(monitor.getStatus().pendingOrders.length, 0);
  assert.equal(requests.at(-1).init.headers.Authorization, "Bearer new-token");
  assert.ok(requests.every(r => !/claim|complete|message/.test(r.url)));
});

test("bad credentials back off for fifteen minutes and never leak rejection details", async () => {
  const { monitor, advance, requests } = fixture([json({ errors: "private-login-detail" }, 401), json({ token: "ok" }), json([])]);
  await monitor.check();
  assert.equal(monitor.getStatus().errorCode, "authentication");
  advance(); await monitor.check(); assert.equal(requests.length, 1);
  advance(14 * BND_POLL_MS); await monitor.check(); assert.equal(monitor.getStatus().state, "connected");
  assert.doesNotMatch(JSON.stringify(monitor.getStatus()), /private-login-detail/);
});

test("rate limits honor Retry-After without multiplying requests", async () => {
  const { monitor, requests, advance } = fixture([json({ token: "session" }), json({}, 429, { "retry-after": "300" }), json([])]);
  await monitor.check(); assert.equal(monitor.getStatus().errorCode, "rate_limited");
  advance(299000); await monitor.check(); assert.equal(requests.length, 2);
  advance(1000); await monitor.check(); assert.equal(monitor.getStatus().state, "connected");
});

test("overlapping checks share one in-flight request; late cache becomes unavailable", async () => {
  let release;
  const { monitor, requests, advance } = fixture([
    () => new Promise(resolve => { release = resolve; }), json([row(1)]),
  ]);
  const first = monitor.check();
  await monitor.check(); await monitor.check(); assert.equal(requests.length, 1);
  release(json({ token: "session" })); await first;
  advance(120001);
  assert.equal(monitor.getStatus().state, "error");
  assert.equal(monitor.getStatus().pendingOrders.length, 1);
});

test("slow requests are bounded and shutdown aborts an in-flight request", async () => {
  const monitor = createBndMonitor({ enabled: true, email: "user", password: "secret", requestTimeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("private-network-error")), { once: true });
    }) });
  await monitor.check(); assert.equal(monitor.getStatus().errorCode, "connection");
  let aborted = false;
  const stopping = createBndMonitor({ enabled: true, email: "user", password: "secret",
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => { aborted = true; reject(new Error("stopped")); }, { once: true });
    }) });
  const check = stopping.check(); stopping.stop(); await check;
  assert.equal(aborted, true);
  assert.equal(stopping.getStatus().lastSuccessAt, null);
});
