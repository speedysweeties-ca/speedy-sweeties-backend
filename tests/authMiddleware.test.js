const assert = require("node:assert/strict");
const test = require("node:test");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/auth_middleware_test";
process.env.JWT_SECRET = "auth-middleware-fixture-secret";
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "{}";
const jwt = require("jsonwebtoken");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../dist/lib/prisma");
const { signAuthToken } = require("../dist/utils/jwt");
const { requireAuth } = require("../dist/middleware/auth.middleware");

test("staff sessions distinguish unavailable account lookups from rejected credentials", async t => {
  const originalFindUnique = prisma.user.findUnique;
  t.after(() => { prisma.user.findUnique = originalFindUnique; });
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  let account;
  let failure;
  let lookupCalls = 0;
  prisma.user.findUnique = async ({ where }) => {
    lookupCalls += 1;
    if (failure) throw failure;
    assert.equal(where.id, "staff-fixture");
    return account;
  };
  const activeAccount = role => ({
    id: "staff-fixture", email: "current@example.invalid", role, isActive: true,
    passwordChangeRequired: false, authVersion: 2, forceLogoutAt: null
  });
  const validToken = role => signAuthToken({
    userId: "staff-fixture", email: "old@example.invalid", role, authVersion: 2
  });
  const invoke = async authorization => {
    const req = { headers: authorization === undefined ? {} : { authorization } };
    const result = { status: 200, headers: {}, body: undefined, nextCalls: 0 };
    const res = {
      set(name, value) { result.headers[name] = value; return this; },
      status(value) { result.status = value; return this; },
      json(body) { result.body = body; return this; }
    };
    await requireAuth(req, res, () => { result.nextCalls += 1; });
    return { ...result, user: req.user };
  };

  for (const role of ["DRIVER", "DISPATCHER", "ADMIN"]) {
    await t.test(`${role}: same session survives a database disconnect and recovers`, async () => {
      account = activeAccount(role); failure = undefined;
      const authorization = `Bearer ${validToken(role)}`;
      assert.equal((await invoke(authorization)).nextCalls, 1);
      failure = new Prisma.PrismaClientKnownRequestError(
        "Server has closed the connection. private-database-details",
        { code: "P1017", clientVersion: "test" }
      );
      const unavailable = await invoke(authorization);
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.body.code, "AUTH_SERVICE_UNAVAILABLE");
      assert.equal(unavailable.headers["Retry-After"], "5");
      assert.equal(unavailable.nextCalls, 0);
      assert.equal(unavailable.user, undefined);
      assert(!JSON.stringify(unavailable).includes("private-database-details"));
      failure = undefined;
      const recovered = await invoke(authorization);
      assert.equal(recovered.status, 200);
      assert.equal(recovered.nextCalls, 1);
      assert.equal(recovered.user.email, account.email);
      assert.equal(recovered.user.role, role);
    });
  }

  await t.test("pool timeout, initialization failure and unexpected lookup errors are not 401", async () => {
    account = activeAccount("DRIVER");
    const authorization = `Bearer ${validToken("DRIVER")}`;
    for (const error of [
      new Prisma.PrismaClientKnownRequestError("Pool timeout", { code: "P2024", clientVersion: "test" }),
      new Prisma.PrismaClientInitializationError("Database unavailable", "test", "P1001"),
      new Error("Lookup failed")
    ]) {
      failure = error;
      const response = await invoke(authorization);
      assert.equal(response.status, 503);
      assert.equal(response.nextCalls, 0);
      assert.equal(response.user, undefined);
    }
    failure = undefined;
  });

  await t.test("missing, malformed, invalid-signature and expired tokens still return 401 without a database lookup", async () => {
    const expired = jwt.sign({ userId: "staff-fixture" }, process.env.JWT_SECRET, { expiresIn: -1 });
    const wrongSignature = jwt.sign({ userId: "staff-fixture" }, "wrong-fixture-secret");
    const before = lookupCalls;
    for (const authorization of [undefined, "Basic invalid", "Bearer ", "Bearer invalid", `Bearer ${expired}`, `Bearer ${wrongSignature}`]) {
      const response = await invoke(authorization);
      assert.equal(response.status, 401);
      assert.equal(response.nextCalls, 0);
      assert.equal(response.user, undefined);
    }
    assert.equal(lookupCalls, before);
  });

  await t.test("deleted, deactivated, reset-required, revoked and forced-out accounts remain rejected", async () => {
    const authorization = `Bearer ${validToken("DISPATCHER")}`;
    for (const value of [
      null,
      { ...activeAccount("DISPATCHER"), isActive: false },
      { ...activeAccount("DISPATCHER"), passwordChangeRequired: true },
      { ...activeAccount("DISPATCHER"), authVersion: 3 },
      { ...activeAccount("DISPATCHER"), forceLogoutAt: new Date() }
    ]) {
      account = value;
      const response = await invoke(authorization);
      assert.equal(response.status, 401);
      assert.equal(response.nextCalls, 0);
      assert.equal(response.user, undefined);
    }
  });

  await t.test("revocation during an outage is checked again after recovery", async () => {
    const authorization = `Bearer ${validToken("DRIVER")}`;
    account = activeAccount("DRIVER");
    failure = new Error("Database temporarily unavailable");
    assert.equal((await invoke(authorization)).status, 503);
    account = { ...account, authVersion: 3 };
    failure = undefined;
    const response = await invoke(authorization);
    assert.equal(response.status, 401);
    assert.equal(response.nextCalls, 0);
  });

  assert(logs.length > 0);
  assert(logs.every(args => args.length === 1 && args[0] === "[auth] Staff account lookup unavailable"));
});
