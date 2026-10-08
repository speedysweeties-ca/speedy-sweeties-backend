const assert = require("node:assert/strict");
const test = require("node:test");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/staff_management_test";
process.env.JWT_SECRET = "staff-management-fixture-secret";
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "{}";
const express = require("express");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../dist/lib/prisma");
const routes = require("../dist/routes/auth.routes").default;
const { errorHandler } = require("../dist/middleware/errorHandler");
const { signAuthToken, signPasswordChangeToken } = require("../dist/utils/jwt");
const { hashPassword, comparePassword } = require("../dist/utils/hash");

test("staff lifecycle: authorization, profile edits, reset-only credentials, revocation and reactivation", async t => {
  const accounts = new Map();
  const original = [];
  const mock = (object, key, replacement) => { original.push([object, key, object[key]]); object[key] = replacement; };
  t.after(() => original.forEach(([object, key, value]) => { object[key] = value; }));
  let unfinished = 0;
  const historicOrder = Object.freeze({ id: "delivered-order", assignedDriverId: "driver", orderStatus: "DELIVERED" });
  let historicalQuery;
  const passwordHash = await hashPassword("Original-fixture-password");
  for (const [id, role] of [["owner", "ADMIN"], ["other-admin", "ADMIN"], ["driver", "DRIVER"], ["dispatcher", "DISPATCHER"]]) {
    accounts.set(id, { id, role, email: `${id}@example.invalid`, firstName: "Test", lastName: id,
      passwordHash, isActive: true, isOnline: false, isVisibleInDispatch: true, passwordChangeRequired: false,
      authVersion: 0, staffRevision: 0, forceLogoutAt: null, updatedAt: new Date() });
  }
  const select = (user, fields) => !user ? null : fields ? Object.fromEntries(Object.keys(fields).map(key => [key, user[key]])) : { ...user };
  const match = (user, where) => Object.entries(where).every(([key, value]) => user[key] === value);
  mock(prisma.user, "findUnique", async ({ where, select: fields }) => select([...accounts.values()].find(user => match(user, where)), fields));
  mock(prisma.user, "findMany", async ({ where, select: fields }) => {
    if (where) historicalQuery = where;
    return [...accounts.values()].map(user => select(user, fields));
  });
  mock(prisma.user, "updateMany", async ({ where, data }) => {
    const user = [...accounts.values()].find(user => match(user, where));
    if (!user) return { count: 0 };
    if (data.email && [...accounts.values()].some(other => other.id !== user.id && other.email === data.email)) {
      throw new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "test" });
    }
    for (const [key, value] of Object.entries(data)) user[key] = value && typeof value === "object" && "increment" in value ? user[key] + value.increment : value;
    user.updatedAt = new Date();
    return { count: 1 };
  });
  mock(prisma.user, "update", async ({ where, data }) => {
    await prisma.user.updateMany({ where, data }); return { ...accounts.get(where.id) };
  });
  mock(prisma.order, "count", async ({ where }) => {
    assert.equal(accounts.get(where.assignedDriverId).role, "DRIVER");
    assert.deepEqual(where.orderStatus.in, ["PLACED", "DISPATCHED", "ACCEPTED", "OUT_FOR_DELIVERY"]);
    return where.assignedDriverId === "driver" ? unfinished : 0;
  });
  mock(prisma, "$transaction", async callback => callback(prisma));
  mock(prisma, "$queryRaw", async (_sql, id) => [{ id }]);
  const app = express(); app.use(express.json()); app.use("/auth", routes); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/auth`;
  const token = id => { const user = accounts.get(id); return signAuthToken({ userId: id, email: user.email, role: user.role, authVersion: user.authVersion }); };
  const admin = token("owner");
  const call = async (path, method = "GET", body, auth = admin) => {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const edit = (id, changes = {}) => {
    const { firstName, lastName, email, role, staffRevision } = accounts.get(id);
    return { firstName, lastName, email, role, staffRevision, ...changes };
  };
  const status = (id, isActive) => call(`/staff/${id}/status`, "PATCH", { isActive, staffRevision: accounts.get(id).staffRevision });
  const reset = id => call(`/staff/${id}/reset-password`, "POST", { temporaryPassword: "Temporary-fixture-password", staffRevision: accounts.get(id).staffRevision });
  const login = (id, password, extra = {}) => call("/login", "POST", { email: accounts.get(id).email, password, ...extra }, null);

  await t.test("administrators alone can read/edit; administrator accounts and self cannot be changed", async () => {
    assert.equal((await call("/staff", "GET", undefined, null)).status, 401);
    for (const id of ["driver", "dispatcher"]) {
      for (const [path, method, body] of [["/staff", "GET"], ["/staff/driver", "PATCH", edit("driver")],
        ["/staff/driver/status", "PATCH", { isActive: false, staffRevision: 0 }],
        ["/staff/driver/reset-password", "POST", { temporaryPassword: "Temporary-fixture-password", staffRevision: 0 }]]) {
        assert.equal((await call(path, method, body, token(id))).status, 403);
      }
    }
    for (const id of ["owner", "other-admin"]) {
      assert.equal((await status(id, false)).status, 403);
      assert.equal((await reset(id)).status, 403);
      assert.equal((await call(`/staff/${id}`, "PATCH", edit(id, { role: "DRIVER" }))).status, 403);
    }
    const listed = await call("/staff"); assert.equal(listed.status, 200); assert.equal(listed.body.staff.length, 4);
    assert(!JSON.stringify(listed.body).includes("passwordHash")); assert(!JSON.stringify(listed.body).includes("authVersion"));
    assert.equal((await call("/staff/missing/status", "PATCH", { isActive: false, staffRevision: 0 })).status, 404);
  });

  await t.test("edits normalize details, reject duplicate emails/admin promotion, keep history and detect concurrent edits", async () => {
    const oldSession = token("dispatcher");
    const legacyDriver = signAuthToken({ userId: "driver", email: "driver@example.invalid", role: "DRIVER" });
    assert.equal((await call("/me", "GET", undefined, legacyDriver)).status, 200);
    const saved = await call("/staff/dispatcher", "PATCH", edit("dispatcher", { firstName: "  Updated  ", email: " NEW.DISPATCHER@EXAMPLE.INVALID " }));
    assert.equal(saved.status, 200); assert.equal(saved.body.user.firstName, "Updated"); assert.equal(saved.body.user.email, "new.dispatcher@example.invalid");
    assert.equal((await call("/me", "GET", undefined, oldSession)).status, 401);
    assert.equal((await call("/staff/dispatcher", "PATCH", edit("dispatcher", { staffRevision: 0 }))).status, 409);
    assert.equal((await call("/staff/dispatcher", "PATCH", edit("dispatcher", { email: "driver@example.invalid" }))).status, 409);
    for (const invalid of [{ role: "ADMIN" }, { firstName: " " }, { email: "invalid" }, { isActive: false }, { passwordHash: "injected" }]) {
      assert.equal((await call("/staff/dispatcher", "PATCH", edit("dispatcher", invalid))).status, 400);
    }
    // Routine login/presence timestamps must not invalidate an open profile edit.
    accounts.get("dispatcher").updatedAt = new Date(Date.now() + 10000);
    assert.equal((await call("/staff/dispatcher", "PATCH", edit("dispatcher", { role: "DRIVER" }))).status, 200);
    assert.equal((await call("/staff/dispatcher", "PATCH", edit("dispatcher", { role: "DISPATCHER" }))).status, 200);
    assert.equal(historicOrder.assignedDriverId, "driver");
    await call("/drivers/history"); assert.deepEqual(historicalQuery.OR, [{ role: "DRIVER" }, { assignedOrders: { some: {} } }]);
  });

  await t.test("unfinished deliveries block driver access changes but still allow a name correction", async () => {
    unfinished = 2;
    assert.equal((await status("driver", false)).status, 409);
    assert.equal((await reset("driver")).status, 409);
    assert.equal((await call("/staff/driver", "PATCH", edit("driver", { role: "DISPATCHER" }))).status, 409);
    assert.equal((await call("/staff/driver", "PATCH", edit("driver", { email: "different@example.invalid" }))).status, 409);
    assert.equal((await call("/staff/driver", "PATCH", edit("driver", { firstName: "Corrected" }))).status, 200);
    assert.equal(accounts.get("driver").isActive, true); unfinished = 0;
  });

  await t.test("reset revokes sessions, requires own password, isolates credentials and prevents replay for both roles", async () => {
    for (const id of ["driver", "dispatcher"]) {
      const oldSession = token(id);
      const result = await reset(id); assert.equal(result.status, 200);
      assert.equal(result.body.user.passwordChangeRequired, true);
      assert(!JSON.stringify(result.body).includes("Temporary-fixture-password"));
      assert(await comparePassword("Temporary-fixture-password", accounts.get(id).passwordHash));
      assert.equal((await call("/me", "GET", undefined, oldSession)).status, 401);
      assert.equal((await login(id, "Original-fixture-password")).status, 401);
      const pending = await login(id, "Temporary-fixture-password");
      assert.equal(pending.status, 403); assert.equal(pending.body.code, "PASSWORD_CHANGE_REQUIRED"); assert.equal(pending.body.token, undefined);
      const { resetToken } = pending.body;
      assert.equal((await call("/me", "GET", undefined, resetToken)).status, 401);
      assert.equal((await call("/change-password", "POST", { resetToken: admin, password: "My-own-fixture-password" }, null)).status, 401);
      assert.equal((await call("/change-password", "POST", { resetToken, password: "Temporary-fixture-password" }, null)).status, 400);
      assert.equal((await call("/change-password", "POST", { resetToken, password: "😀".repeat(30) }, null)).status, 400);
      const changed = await call("/change-password", "POST", { resetToken, password: "My-own-fixture-password" }, null);
      assert.equal(changed.status, 200); assert.equal(changed.body.token, undefined);
      assert.equal((await call("/change-password", "POST", { resetToken, password: "Another-fixture-password" }, null)).status, 401);
      assert.equal((await login(id, "Temporary-fixture-password")).status, 401);
      const signedIn = await login(id, "My-own-fixture-password"); assert.equal(signedIn.status, 200);
      assert.equal((await call("/me", "GET", undefined, signedIn.body.token)).status, 200);
      assert.equal((await call("/me", "GET", undefined, oldSession)).status, 401);
    }
  });

  await t.test("deactivation blocks login and password tickets; reactivation never restores revoked sessions", async () => {
    for (const id of ["driver", "dispatcher"]) {
      const oldSession = token(id), resetToken = signPasswordChangeToken(id, accounts.get(id).authVersion);
      assert.equal((await status(id, false)).status, 200);
      assert.equal((await login(id, "My-own-fixture-password")).status, 403);
      assert.equal((await call("/me", "GET", undefined, oldSession)).status, 401);
      assert.equal((await call("/change-password", "POST", { resetToken, password: "Another-fixture-password" }, null)).status, 401);
      assert.equal((await reset(id)).status, 409);
      assert.equal((await status(id, true)).status, 200);
      assert.equal((await call("/me", "GET", undefined, oldSession)).status, 401);
      const signedIn = await login(id, "My-own-fixture-password"); assert.equal(signedIn.status, 200);
      assert.equal((await call("/me", "GET", undefined, oldSession)).status, 401);
      assert.equal((await call("/me", "GET", undefined, signedIn.body.token)).status, 200);
    }
  });

  await t.test("driver force logout remains effective after fresh login; password portal does not set driver online", async () => {
    const oldSession = token("driver");
    assert.equal((await call("/drivers/driver/force-logout", "PATCH", {})).status, 200);
    assert.equal((await call("/me", "GET", undefined, oldSession)).status, 401);
    const portal = await login("driver", "My-own-fixture-password", { passwordChangeOnly: true });
    assert.equal(portal.status, 403); assert.equal(accounts.get("driver").isOnline, false);
    assert.equal((await login("driver", "My-own-fixture-password")).status, 200);
    assert.equal((await call("/me", "GET", undefined, oldSession)).status, 401);
    const ticket = portal.body.resetToken;
    assert.equal((await reset("driver")).status, 200);
    assert.equal((await call("/change-password", "POST", { resetToken: ticket, password: "Another-fixture-password" }, null)).status, 401);
    assert.deepEqual(historicOrder, { id: "delivered-order", assignedDriverId: "driver", orderStatus: "DELIVERED" });
    assert.equal((await call("/me", "GET", undefined, admin)).status, 200);
  });

  await t.test("only admins can force logout dispatchers; other accounts are never targeted", async () => {
    const path = "/dispatchers/dispatcher/force-logout";
    const before = { ...accounts.get("dispatcher") };
    assert.equal((await call(path, "PATCH", undefined, null)).status, 401);
    assert.equal((await call(path, "PATCH", undefined, token("dispatcher"))).status, 403);
    // Restore this fixture's driver after its password reset in the preceding test.
    const driver = accounts.get("driver");
    driver.passwordChangeRequired = false;
    assert.equal((await call(path, "PATCH", undefined, token("driver"))).status, 403);
    assert.deepEqual(accounts.get("dispatcher"), before);
    for (const id of ["owner", "other-admin", "driver", "missing"]) {
      const accountBefore = accounts.has(id) ? { ...accounts.get(id) } : undefined;
      assert.equal((await call(`/dispatchers/${id}/force-logout`, "PATCH")).status, 404);
      assert.deepEqual(accounts.get(id), accountBefore);
    }
  });

  await t.test("dispatcher logout revokes all existing sessions and allows normal fresh login without reviving old tokens", async () => {
    const first = await login("dispatcher", "My-own-fixture-password");
    const second = await login("dispatcher", "My-own-fixture-password");
    assert.equal(first.status, 200); assert.equal(second.status, 200);
    const before = { ...accounts.get("dispatcher") };
    // JWTs issued in the same second can be identical; represent an earlier device's session too.
    second.body.token = signAuthToken({ userId: before.id, role: before.role, email: before.email,
      authVersion: before.authVersion, iat: Math.floor(Date.now() / 1000) - 60 });
    assert.notEqual(first.body.token, second.body.token);
    assert.equal((await call("/me", "GET", undefined, second.body.token)).status, 200);
    const result = await call("/dispatchers/dispatcher/force-logout", "PATCH");
    assert.equal(result.status, 200); assert.equal(result.body.success, true);
    const after = accounts.get("dispatcher");
    assert.equal(after.authVersion, before.authVersion + 1);
    assert.equal(after.staffRevision, before.staffRevision + 1);
    assert.equal(after.isOnline, false); assert(after.forceLogoutAt instanceof Date);
    for (const field of ["isActive", "passwordHash", "passwordChangeRequired", "role", "email", "isVisibleInDispatch"]) {
      assert.equal(after[field], before[field]);
    }
    for (const old of [first.body.token, second.body.token]) {
      assert.equal((await call("/me", "GET", undefined, old)).status, 401);
    }
    const fresh = await login("dispatcher", "My-own-fixture-password");
    assert.equal(fresh.status, 200); assert.equal(after.forceLogoutAt, null);
    assert.equal((await call("/me", "GET", undefined, fresh.body.token)).status, 200);
    for (const old of [first.body.token, second.body.token]) {
      assert.equal((await call("/me", "GET", undefined, old)).status, 401);
    }
    assert.equal((await call("/me", "GET", undefined, admin)).status, 200);
    assert.deepEqual(historicOrder, { id: "delivered-order", assignedDriverId: "driver", orderStatus: "DELIVERED" });
  });
});
