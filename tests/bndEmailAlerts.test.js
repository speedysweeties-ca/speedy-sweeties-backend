const assert = require("node:assert/strict");
const test = require("node:test");
const { createBndEmailProcessor, getBndEmailRecipients, sendBndEmailWithResend, sendBndEmailRoutingCheck, bndEmailFailureReason } = require("../dist/services/bndEmailAlerts.service.js");
const { env } = require("../dist/config/env.js");

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
  for (const state of ["error", "disabled", "unconfigured", "checking", "paused"]) {
    const h = harness(); h.setStatus({ state });
    await createBndEmailProcessor(h.options).check(); assert.deepEqual(h.sent, []);
  }
  for (const lastSuccessAt of [null, "invalid", "2026-10-05T15:00:00Z"]) {
    const h = harness(); h.setStatus({ lastSuccessAt });
    await createBndEmailProcessor(h.options).check(); assert.deepEqual(h.sent, []);
  }
});

test("paused monitoring skips email settings database reads", async () => {
  const h = harness(); h.setStatus({ state: "paused" });
  let reads = 0;
  h.options.store.enabled = async () => { reads++; return true; };
  await createBndEmailProcessor(h.options).check();
  assert.equal(reads, 0); assert.deepEqual(h.sent, []);
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

test("optional copy validates one address and preserves the primary recipient", () => {
  for (const copy of ["", "  ", "bad-address", "one@example.invalid,two@example.invalid", "RSTUBBINGS@HOTMAIL.COM"]) {
    assert.deepEqual(getBndEmailRecipients(copy), ["rstubbings@hotmail.com"]);
  }
  assert.deepEqual(getBndEmailRecipients(" copy@example.invalid "), ["rstubbings@hotmail.com", "copy@example.invalid"]);
});

test("delivery checks require a fresh explicit timestamp and keep a stable clearly labelled request", async t => {
  const originalCopy = env.BND_EMAIL_COPY_TO;
  t.after(() => { env.BND_EMAIL_COPY_TO = originalCopy; });
  env.BND_EMAIL_COPY_TO = "copy@example.invalid";
  const now = Date.parse("2026-11-13T18:15:00Z"), requests = [];
  const options = { apiKey: "test-key", from: "alerts@example.invalid", fetchImpl: async (url, init) => {
    requests.push(init); return Response.json({ id: "test-message" });
  } };
  for (const timestamp of ["", "invalid", "2026-11-13T18:15:01Z", "2026-11-13T18:05:00Z", "2026-11-12T18:15:00Z"]) {
    assert.equal(await sendBndEmailRoutingCheck(timestamp, options, now), false);
  }
  assert.equal(requests.length, 0);
  for (let i = 0; i < 2; i++) assert.equal(await sendBndEmailRoutingCheck("2026-11-13T18:15:00Z", options, now), true);
  assert.equal(requests[0].headers["Idempotency-Key"], requests[1].headers["Idempotency-Key"]);
  assert.equal(requests[0].body, requests[1].body);
  const body = JSON.parse(requests[0].body);
  assert.deepEqual(body.to, ["rstubbings@hotmail.com", "copy@example.invalid"]);
  assert.match(body.subject, /^TEST ONLY/); assert.match(body.text, /No order has been created/);
});

test("provider failures expose only HTTP status and fixed categories, never raw provider or database text", async () => {
  for (const [status, message, expected] of [
    [403, "You can only send testing emails to PRIVATE@example.invalid", "testing_sender_restriction"],
    [403, "The PRIVATE domain is not verified", "unverified_sender_domain"],
    [429, "daily limit exceeded PRIVATE", "sending_quota"],
    [429, "PRIVATE too many requests", "rate_limit"],
    [409, "PRIVATE conflict", "idempotency_conflict"],
    [500, "PRIVATE", "provider_rejection"],
  ]) {
    await assert.rejects(sendBndEmailWithResend({ id: "test-1", number: "1" }, {
      apiKey: "test-key", from: "alerts@example.invalid", fetchImpl: async () => Response.json({ message }, { status }),
    }), error => {
      assert.equal(bndEmailFailureReason(error), `HTTP ${status}: ${expected}`);
      assert.doesNotMatch(bndEmailFailureReason(error), /PRIVATE/); return true;
    });
  }
  assert.equal(bndEmailFailureReason(new Error("PRIVATE connection details")), "delivery unconfirmed");
  const h = harness(), reasons = [];
  h.options.onError = reason => reasons.push(reason);
  h.options.send = async () => { throw new Error("PRIVATE"); };
  await createBndEmailProcessor(h.options).check();
  assert.deepEqual(reasons, ["delivery unconfirmed"]);
});

test("provider requests include the configured copy, carry no customer data, and use a stable idempotency key", async t => {
  const originalCopy = env.BND_EMAIL_COPY_TO;
  t.after(() => { env.BND_EMAIL_COPY_TO = originalCopy; });
  env.BND_EMAIL_COPY_TO = "copy@example.invalid";
  const requests = [];
  const options = { apiKey: "test-key", from: "alerts@example.invalid", fetchImpl: async (url, init) => {
    requests.push({ url, init }); return Response.json({ id: "email-1" });
  } };
  await sendBndEmailWithResend({ id: "1", number: "1001", customer: "PRIVATE" }, options);
  await sendBndEmailWithResend({ id: "1", number: "1001" }, options);
  const { url, init } = requests[0]; const body = JSON.parse(init.body);
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(init.redirect, "error"); assert.equal(init.method, "POST");
  assert.deepEqual(body.to, ["rstubbings@hotmail.com", "copy@example.invalid"]);
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
