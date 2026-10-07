const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const { createHash } = require("node:crypto");
const { prisma } = require("../dist/lib/prisma.js");
const { buildCheckInSession } = require("../dist/services/deliveryCheckIn.service.js");
const routes = require("../dist/routes/deliveryCheckIn.routes.js").default;
const { errorHandler } = require("../dist/middleware/errorHandler.js");
const { signAuthToken } = require("../dist/utils/jwt.js");
const token = "a".repeat(43);

test("customer page and assets have private caching and restricted embedding headers", async t => {
  const app = require("../dist/app.js").default;
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ["/track/", "/track/check-in.js", "/track/check-in.css"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(response.headers.get("x-frame-options"), null);
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'self' https:\/\/www.speedysweeties.ca/);
  }
});

test("Webflow release bundle stays within its code limit and contains valid scripts", () => {
  const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
  const footer = fs.readFileSync(path.join(__dirname, "../webflow/site-footer.html"), "utf8");
  assert(footer.length < 50000);
  const scripts = [...footer.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.filter(script => !/\bsrc=/.test(script[0])).length, 3);
  assert.match(footer, /https:\/\/speedy-api-lbfe.onrender.com\/webflow\/address-autocomplete.js/);
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(__dirname, "../public/webflow/address-autocomplete.js"), "utf8")));
  for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script[1]));
});

const fixture = () => ({
  id: "order-one", orderNumber: 42, orderStatus: "DELIVERED", deliveredAt: new Date("2026-10-04T18:00:00Z"),
  customerName: "Test Customer", orderSource: "ANDROID_APP",
  customer: { loyaltyCompletedOrders: 8, loyaltyProgressMonth: "2026-10", loyaltyRewardBalance: 2 },
  digitalReceipt: { receiptNumber: "SS-42", itemTotal: "20.00", deliveryCharge: "10.64", taxOrFees: "1.38", grandTotal: "32.02", notes: "PRIVATE NOTE" },
  helpRequest: null
});

test("delivered session uses existing monthly app loyalty and selectively exposes receipt fields", () => {
  const order = fixture();
  const data = buildCheckInSession(order, new Date("2026-10-04T18:00:00Z"));
  assert.equal(data.firstName, "Test");
  assert.equal(data.receipt.grandTotal, 32.02);
  assert.equal(data.receipt.notes, undefined);
  assert.equal(data.loyalty.completedOrders, 8);
  assert.equal(data.loyalty.rewardBalance, 2);
  assert.equal(data.loyalty.thisOrderEligible, true);
  assert.equal(buildCheckInSession(order, new Date("2026-11-01T05:00:00Z")).loyalty.completedOrders, 0);
  assert.equal(buildCheckInSession(order, new Date("2026-11-01T05:00:00Z")).loyalty.rewardBalance, 2);
  assert.equal(buildCheckInSession({ ...order, orderSource: "WEBFLOW" }).loyalty.thisOrderEligible, false);
  const pending = buildCheckInSession({ ...order, orderStatus: "OUT_FOR_DELIVERY" });
  assert.equal(pending.firstName, null); assert.equal(pending.receipt, null); assert.equal(pending.loyalty, null); assert.equal(pending.reviewUrl, null);
  assert.equal(data.reviewUrl, buildCheckInSession({ ...order, helpRequest: { status: "OPEN" } }).reviewUrl);
  assert(!data.shareUrl.includes(token)); assert(!data.shareUrl.includes(order.id));
});

test("check-in routes enforce credentials, delivery state, staff roles, idempotency and handling audit", async t => {
  const originals = [];
  function mock(object, method, fn) { originals.push([object, method, object[method]]); object[method] = fn; }
  t.after(() => originals.forEach(([object, method, fn]) => { object[method] = fn; }));
  let order = fixture(), role = "DISPATCHER", active = true, lastLookup, help = null;
  const events = new Map(); let reads = 0;
  mock(prisma.order, "findFirst", async args => { reads++; lastLookup = args; return order; });
  mock(prisma.user, "findUnique", async () => ({ id: "staff-one", email: "test@example.invalid", role, isActive: active }));
  mock(prisma.deliveryHelpRequest, "upsert", async args => {
    help ??= { id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", ...args.create, status: "OPEN", createdAt: new Date(), handledAt: null };
    return Object.fromEntries(Object.keys(args.select).map(key => [key, help[key]]));
  });
  mock(prisma.deliveryCheckInEvent, "upsert", async args => {
    const key = JSON.stringify(args.where); if (!events.has(key)) events.set(key, args.create); return events.get(key);
  });
  mock(prisma.deliveryHelpRequest, "findMany", async () => help ? [help] : []);
  mock(prisma.deliveryHelpRequest, "count", async () => help ? 1 : 0);
  mock(prisma.deliveryHelpRequest, "findUnique", async ({ where }) => help?.id === where.id ? help : null);
  mock(prisma.deliveryHelpRequest, "updateMany", async ({ where, data }) => {
    if (help?.id === where.id && help.status === where.status) { help = { ...help, ...data }; return { count: 1 }; }
    return { count: 0 };
  });
  mock(prisma.deliveryCheckInEvent, "groupBy", async () => [{ type: "SHARE_CLICK", _count: { _all: 2 } }]);
  mock(prisma, "$queryRaw", async parts => {
    const sql = parts.join("?");
    if (sql.includes("first_deliveries")) return [{ firstTimeCustomers: 3n, orderedAgain: 1n }];
    if (sql.includes("averageMinutes")) return [{ handled: 1n, averageMinutes: 12.5 }];
    return [{ count: 1n }];
  });
  const app = express(); app.use(express.json()); app.use("/check-in", routes); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const auth = signAuthToken({ userId: "staff-one", email: "test@example.invalid", role: "ADMIN" });
  const call = (path, body, credential, method = body ? "POST" : "GET") => fetch(`http://127.0.0.1:${server.address().port}/check-in/${path}`, {
    method, headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  assert.equal((await call("session", { trackingToken: "order-one" })).status, 400); assert.equal(reads, 0);
  let response = await call("session", { trackingToken: token });
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(lastLookup.where.trackingTokenHash, createHash("sha256").update(token).digest("hex"));
  assert(lastLookup.where.trackingTokenExpiresAt.gt instanceof Date);
  order = null; assert.equal((await call("help", { trackingToken: token, message: "Missing item" })).status, 404);
  order = { ...fixture(), orderStatus: "PLACED" };
  assert.equal((await call("help", { trackingToken: token, message: "Missing item" })).status, 409);
  assert.equal((await call("events", { trackingToken: token, type: "VIEWED" })).status, 409);
  order = fixture();
  assert.equal((await call("help", { trackingToken: token, message: "  " })).status, 400);
  assert.equal((await call("help", { trackingToken: token, message: "x".repeat(1501) })).status, 400);
  response = await call("help", { trackingToken: token, message: "Missing item" }); assert.equal(response.status, 200);
  assert.equal((await response.json()).data.message, undefined);
  await call("help", { trackingToken: token, message: "Duplicate attempt" }); assert.equal(help.message, "Missing item");
  await call("events", { trackingToken: token, type: "SHARE_CLICK" }); await call("events", { trackingToken: token, type: "SHARE_CLICK" }); assert.equal(events.size, 1);
  assert.equal((await call("events", { trackingToken: token, type: "FAKE" })).status, 400);
  assert.equal((await call("requests")).status, 401);
  role = "DRIVER"; assert.equal((await call("requests", null, auth)).status, 403);
  role = "DISPATCHER"; active = false; assert.equal((await call("requests", null, auth)).status, 401);
  active = true; assert.equal((await call("requests", null, auth)).status, 200);
  assert.equal((await call("requests?page=0", null, auth)).status, 400);
  assert.equal((await call("results", null, auth)).status, 403);
  const handlePath = `requests/${help.id}/handled`;
  assert.equal((await call(handlePath, { resolutionNote: " " }, auth, "PATCH")).status, 400);
  assert.equal((await call(handlePath, { resolutionNote: "Called customer; resolved" }, auth, "PATCH")).status, 200);
  const handledAt = help.handledAt; assert.equal(help.handledByUserId, "staff-one");
  await call(handlePath, { resolutionNote: "Should not replace" }, auth, "PATCH");
  assert.equal(help.handledAt, handledAt); assert.equal(help.resolutionNote, "Called customer; resolved");
  role = "ADMIN";
  response = await call("results?startDate=2026-10-01&endDate=2026-10-04", null, auth);
  assert.equal(response.status, 200); const results = (await response.json()).data;
  assert.equal(results.orderedAgain, 1); assert.equal(results.firstTimeCustomers, 3); assert.equal(results.shareClicks, 2); assert.equal(results.averageHandlingMinutes, 12.5);
  assert.equal((await call("results?startDate=bad", null, auth)).status, 400);
});
