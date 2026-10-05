const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const routes = require("../dist/routes/bndAlerts.routes.js").default;
const { prisma } = require("../dist/lib/prisma.js");
const { env } = require("../dist/config/env.js");
const { signAuthToken } = require("../dist/utils/jwt.js");
const { BND_EMAIL_SETTING_KEY, prismaBndEmailStore } = require("../dist/services/bndEmailAlerts.service.js");

test("B&D email settings require an active admin and cannot change the fixed recipient", async t => {
  let role = "ADMIN", isActive = true, forceLogoutAt = null, value = null;
  const original = { user: prisma.user.findUnique, find: prisma.systemSetting.findUnique,
    save: prisma.systemSetting.upsert, apiKey: env.RESEND_API_KEY };
  t.after(() => { prisma.user.findUnique = original.user; prisma.systemSetting.findUnique = original.find;
    prisma.systemSetting.upsert = original.save; env.RESEND_API_KEY = original.apiKey; });
  prisma.user.findUnique = async () => ({ id: "admin", email: "admin@example.invalid", role, isActive, forceLogoutAt });
  prisma.systemSetting.findUnique = async ({ where }) => { assert.equal(where.key, BND_EMAIL_SETTING_KEY); return value === null ? null : { value }; };
  let writes = 0;
  prisma.systemSetting.upsert = async ({ where, create, update }) => {
    assert.equal(where.key, BND_EMAIL_SETTING_KEY); assert.equal(create.value, update.value);
    value = update.value; writes++; return { value };
  };
  env.RESEND_API_KEY = "test-key";
  const app = express(); app.use(express.json()); app.use("/bnd-alerts", routes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const token = signAuthToken({ userId: "admin", email: "admin@example.invalid", role: "ADMIN" });
  const request = (method = "GET", body, credential = token) => fetch(`http://127.0.0.1:${server.address().port}/bnd-alerts/email-settings`, {
    method, headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  for (const method of ["GET", "PUT"]) {
    const body = method === "PUT" ? { enabled: true } : undefined;
    assert.equal((await request(method, body, null)).status, 401);
    assert.equal((await request(method, body, "bad-token")).status, 401);
    // Even a JWT saying ADMIN cannot override the user's current database role.
    for (const denied of ["DISPATCHER", "DRIVER"]) {
      role = denied; assert.equal((await request(method, body)).status, 403);
    }
    role = "ADMIN"; isActive = false; assert.equal((await request(method, body)).status, 401);
    isActive = true; forceLogoutAt = new Date(); assert.equal((await request(method, body)).status, 401);
    forceLogoutAt = null;
  }
  assert.equal(writes, 0);
  const initial = await request(); assert.equal(initial.status, 200);
  assert.equal(initial.headers.get("cache-control"), "no-store");
  assert.deepEqual(await initial.json(), { enabled: false, recipient: "rstubbings@hotmail.com", configured: true });
  for (const body of [{}, { enabled: "true" }, { enabled: 1 }, { enabled: true, recipient: "elsewhere@example.invalid" }]) {
    assert.equal((await request("PUT", body)).status, 400);
  }
  assert.equal(writes, 0);
  assert.equal((await request("PUT", { enabled: true })).status, 200);
  assert.equal((await (await request()).json()).enabled, true);
  env.RESEND_API_KEY = "";
  assert.equal((await request("PUT", { enabled: true })).status, 503);
  // Turning OFF must still work if provider configuration has been removed.
  assert.equal((await request("PUT", { enabled: false })).status, 200);
  assert.equal((await (await request()).json()).enabled, false);
  assert.equal(writes, 2);
});

test("durable receipt queries prevent resends, preserve the original number, and bound ambiguous retries", async t => {
  const original = { upsert: prisma.bndEmailAlert.upsert, update: prisma.bndEmailAlert.updateMany };
  t.after(() => { prisma.bndEmailAlert.upsert = original.upsert; prisma.bndEmailAlert.updateMany = original.update; });
  const now = new Date("2026-10-05T16:00:00Z");
  prisma.bndEmailAlert.upsert = async ({ where, update, create }) => {
    assert.equal(where.orderId, "bnd-1"); assert.deepEqual(update, {});
    assert.equal(create.orderId, "bnd-1");
    return { orderId: "bnd-1", orderNumber: "original-1001" };
  };
  let count = 1;
  prisma.bndEmailAlert.updateMany = async ({ where, data }) => {
    assert.equal(where.orderId, "bnd-1"); assert.equal(where.sentAt, null);
    if (data.claimedAt) {
      assert.equal(where.createdAt.gte.toISOString(), "2026-10-04T17:00:00.000Z");
      assert.equal(where.OR[0].claimedAt, null);
      assert.equal(where.OR[1].claimedAt.lte.toISOString(), "2026-10-05T15:58:00.000Z");
    } else { assert.deepEqual(where.claimedAt, now); assert.deepEqual(data.sentAt, now); }
    return { count };
  };
  const claim = await prismaBndEmailStore.claim({ id: "bnd-1", number: "changed-1002" }, now);
  assert.equal(claim.order.number, "original-1001");
  await prismaBndEmailStore.markSent(claim, now);
  count = 0; assert.equal(await prismaBndEmailStore.claim({ id: "bnd-1", number: "1001" }, now), null);
});
