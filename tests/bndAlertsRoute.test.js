const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
process.env.BND_MONITOR_ENABLED = "false";
const routes = require("../dist/routes/bndAlerts.routes.js").default;
const { prisma } = require("../dist/lib/prisma.js");
const { signAuthToken } = require("../dist/utils/jwt.js");

test("B&D status is cached, no-store, and limited to active admins and dispatchers", async (t) => {
  let role = "DISPATCHER", active = true, revoked = false;
  const original = prisma.user.findUnique;
  prisma.user.findUnique = async ({ where }) => ({ id: where.id, role, email: "staff@example.invalid", isActive: active, forceLogoutAt: revoked ? new Date() : null });
  t.after(() => { prisma.user.findUnique = original; });
  const app = express(); app.use("/bnd-alerts", routes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const token = signAuthToken({ userId: "bnd-test-staff", email: "staff@example.invalid", role: "ADMIN" });
  const get = (credential = token) => fetch(`http://127.0.0.1:${server.address().port}/bnd-alerts/status`, {
    headers: credential ? { Authorization: `Bearer ${credential}` } : {},
  });
  assert.equal((await get(null)).status, 401);
  assert.equal((await get("bad-token")).status, 401);
  role = "DRIVER"; assert.equal((await get()).status, 403);
  role = "DISPATCHER"; active = false; assert.equal((await get()).status, 401);
  active = true; revoked = true; assert.equal((await get()).status, 401);
  revoked = false;
  for (const allowedRole of ["ADMIN", "DISPATCHER"]) {
    role = allowedRole;
    const result = await get(); assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.deepEqual(await result.json(), {
      state: "disabled", pendingOrders: [], lastCheckedAt: null, lastSuccessAt: null, nextCheckAt: null, errorCode: null,
    });
  }
});
