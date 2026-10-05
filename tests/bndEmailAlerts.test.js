const assert = require("node:assert/strict");
const test = require("node:test");
const { createBndEmailProcessor, sendBndEmailWithResend } = require("../dist/services/bndEmailAlerts.service.js");

function harness() {
  let time = Date.parse("2026-10-05T16:00:00Z");
  let enabled = true;
  let status = { state: "connected", lastSuccessAt: new Date(time).toISOString(), pendingOrders: [{ id: "1", number: "1001" }] };
  const receipts = new Map(), sent = [], errors = [];
  const store = {
    enabled: async () => enabled,
    claim: async (order, now) => {
      const previous = receipts.get(order.id);
      if (previous?.sent || (previous?.claim && now - previous.claim.claimedAt < 120_000)) return null;
      const claim = { order: { ...order }, claimedAt: now };
      receipts.set(order.id, { claim, sent: false });
      return claim;
    },
    markSent: async claim => { receipts.get(claim.order.id).sent = true; },
  };
  const options = { store, getStatus: () => status, now: () => time,
    send: async order => { sent.push(order.id); }, onError: () => errors.push(true) };
  return { options, sent, errors, receipts,
    setEnabled: value => { enabled = value; }, setStatus: value => { status = { ...status, ...value }; },
    advance: ms => { time += ms; status.lastSuccessAt = new Date(time).toISOString(); } };
}

test("B&D email stays off until enabled and sends once across polls, restarts and re-enabling", async () => {
  const h = harness(); const processor = createBndEmailProcessor(h.options);
  h.setEnabled(false); await processor.check(); assert.deepEqual(h.sent, []);
  h.setEnabled(true); await processor.check(); await processor.check();
  await createBndEmailProcessor(h.options).check();
  h.setEnabled(false); await processor.check(); h.setEnabled(true); await processor.check();
  assert.deepEqual(h.sent, ["1"]);
  h.setStatus({ pendingOrders: [{ id: "1", number: "1001" }, { id: "2", number: "1002" }] });
  await processor.check(); assert.deepEqual(h.sent, ["1", "2"]);
});

test("failed/stale/disabled B&D status never emails cached orders", async () => {
  for (const state of ["error", "disabled", "unconfigured", "checking"]) {
    const h = harness(); h.setStatus({ state });
    await createBndEmailProcessor(h.options).check(); assert.deepEqual(h.sent, []);
  }
  for (const lastSuccessAt of [null, "invalid", "2026-10-05T15:00:00Z"]) {
    const h = harness(); h.setStatus({ lastSuccessAt });
    await createBndEmailProcessor(h.options).check(); assert.deepEqual(h.sent, []);
  }
});

test("rechecks the switch and waiting status after acquiring a claim", async () => {
  for (const action of [h => h.setEnabled(false), h => h.setStatus({ pendingOrders: [] })]) {
    const h = harness(); const claim = h.options.store.claim;
    h.options.store.claim = async (...args) => { const result = await claim(...args); action(h); return result; };
    await createBndEmailProcessor(h.options).check(); assert.deepEqual(h.sent, []);
  }
});

test("email failure is isolated and retried with the same order after the claim delay", async () => {
  const h = harness(); let attempts = 0;
  h.options.send = async order => { if (++attempts === 1) throw new Error("provider timeout"); h.sent.push(order.id); };
  const processor = createBndEmailProcessor(h.options);
  await processor.check(); await processor.check();
  assert.equal(attempts, 1); assert.equal(h.errors.length, 1);
  h.advance(120_000); await processor.check(); await processor.check();
  assert.deepEqual(h.sent, ["1"]); assert.equal(attempts, 2);
});

test("overlapping checks and independent workers share the claim; stopping prevents further sends", async () => {
  const h = harness(); const first = createBndEmailProcessor(h.options), second = createBndEmailProcessor(h.options);
  await Promise.all([first.check(), first.check(), second.check()]);
  assert.deepEqual(h.sent, ["1"]);
  h.setStatus({ pendingOrders: [{ id: "2", number: "1002" }] });
  first.stop(); await first.check(); assert.deepEqual(h.sent, ["1"]);
});

test("a database failure after provider acceptance retries the same email identity", async () => {
  const h = harness(); const markSent = h.options.store.markSent; let attempts = 0;
  h.options.store.markSent = async (...args) => { if (++attempts === 1) throw new Error("db unavailable"); await markSent(...args); };
  const processor = createBndEmailProcessor(h.options);
  await processor.check(); h.advance(120_000); await processor.check(); await processor.check();
  assert.deepEqual(h.sent, ["1", "1"]); // Provider key, tested below, deduplicates these requests.
  assert.equal(h.errors.length, 1);
});

test("provider requests go only to the fixed recipient, carry no customer data, and use a stable idempotency key", async () => {
  const requests = [];
  const options = { apiKey: "test-key", from: "alerts@example.invalid", fetchImpl: async (url, init) => {
    requests.push({ url, init }); return Response.json({ id: "email-1" });
  } };
  await sendBndEmailWithResend({ id: "1", number: "1001", customer: "PRIVATE" }, options);
  await sendBndEmailWithResend({ id: "1", number: "1001" }, options);
  const { url, init } = requests[0]; const body = JSON.parse(init.body);
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(init.redirect, "error"); assert.equal(init.method, "POST");
  assert.deepEqual(body.to, ["rstubbings@hotmail.com"]);
  assert.match(body.subject, /New B&D order to collect.*1001/);
  assert.doesNotMatch(init.body, /PRIVATE|customer|address|phone/i);
  assert.equal(init.headers["Idempotency-Key"], "bnd-waiting-order/1");
  assert.equal(requests[1].init.body, init.body);
  assert.equal(requests[1].init.headers["Idempotency-Key"], init.headers["Idempotency-Key"]);
  for (const response of [Response.json({ secret: "PRIVATE" }, { status: 500 }), Response.json({})]) {
    await assert.rejects(sendBndEmailWithResend({ id: "1", number: "1001" }, {
      ...options, fetchImpl: async () => response,
    }), error => !error.message.includes("PRIVATE"));
  }
});
