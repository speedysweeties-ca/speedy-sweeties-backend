const assert = require("node:assert/strict");
const test = require("node:test");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/session_log_test";
process.env.JWT_SECRET = "session-log-fixture-secret";
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "{}";
const express = require("express");
const jwt = require("jsonwebtoken");
const { prisma } = require("../dist/lib/prisma");
const { signAuthToken } = require("../dist/utils/jwt");
const { recordSessionEvent, flushSessionEvents } = require("../dist/services/staffSessionLog.service");
const { requireAuth } = require("../dist/middleware/auth.middleware");
const authRoutes = require("../dist/routes/auth.routes").default;
const { errorHandler } = require("../dist/middleware/errorHandler");

test("logout reasons are attributed, private, admin-only, deduplicated and independent of DB failures", async t => {
  const rows = new Map();
  let failingWrites = false;
  let lookupFailure = false;
  let role = "ADMIN";
  let active = true;
  let forced = null;
  let actionSucceeds = true;
  const info = [];
  const originals = [];
  const mock = (object, key, value) => { originals.push([object, key, object[key]]); object[key] = value; };
  t.after(() => originals.forEach(([object, key, value]) => { object[key] = value; }));
  t.mock.method(console, "info", text => info.push(text));
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});
  mock(prisma.staffSessionEvent, "upsert", async ({ where, create }) => {
    if (failingWrites) throw new Error("private database credentials must not escape");
    if (!rows.has(where.eventKey)) rows.set(where.eventKey, create);
    return rows.get(where.eventKey);
  });
  mock(prisma.staffSessionEvent, "findMany", async ({ where, take, skip }) => {
    let result = [...rows.values()].filter(row => !where.role || row.role === where.role);
    if (where.OR) result = result.filter(row => where.OR[1].userId.in.includes(row.userId) || (row.staffName || "").includes(where.OR[0].staffName.contains));
    return result.sort((a, b) => b.occurredAt - a.occurredAt).slice(skip, skip + take);
  });
  mock(prisma.user, "findUnique", async ({ where }) => {
    if (lookupFailure) throw new Error("Server has closed the connection");
    return { id: where.id, firstName: "Test", lastName: "Staff", role, isActive: active,
      authVersion: 0, forceLogoutAt: forced, email: "private@example.invalid", passwordHash: "private-password-hash" };
  });
  mock(prisma.user, "findMany", async () => [{ id: "staff", firstName: "Test", lastName: "Staff" }]);
  mock(prisma.user, "update", async ({ where, data }) => ({ id: where.id, role, ...data }));
  mock(prisma.user, "updateMany", async () => ({ count: actionSucceeds ? 1 : 0 }));
  const app = express(); app.use(express.json()); app.use("/auth", authRoutes);
  app.get("/protected", requireAuth, (_req, res) => res.json({ success: true })); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = signAuthToken({ userId: "staff", role: "ADMIN", email: "private@example.invalid", authVersion: 0 });
  const call = async (path, method = "GET", body, credential = token) => {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 private-device-data", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  };

  await t.test("only admins can read the history", async () => {
    assert.equal((await call("/auth/session-log", "GET", undefined, null)).status, 401);
    for (const nonAdmin of ["DRIVER", "DISPATCHER"]) { role = nonAdmin; assert.equal((await call("/auth/session-log")).status, 403); }
    role = "ADMIN";
    const result = await call("/auth/session-log"); assert.equal(result.status, 200); assert.equal(result.cache, "no-store");
  });

  await t.test("client reports use the authenticated identity and cannot invent a server cause", async () => {
    role = "DISPATCHER";
    assert.equal((await call("/auth/session-log/logout", "POST", { reason: "MANUAL_LOGOUT", userId: "someone-else" })).status, 400);
    assert.equal((await call("/auth/session-log/logout", "POST", { reason: "FORCE_LOGOUT" })).status, 400);
    assert.equal((await call("/auth/session-log/logout", "POST", { reason: "MANUAL_LOGOUT" })).status, 202);
    await flushSessionEvents();
    const entry = [...rows.values()].find(row => row.reason === "MANUAL_LOGOUT");
    assert.equal(entry.userId, "staff"); assert.equal(entry.role, "DISPATCHER");
    assert.equal(entry.outcome, "CLIENT_REPORTED"); assert.equal(entry.client, "Web browser");
  });

  await t.test("DB interruptions are recorded separately and retried without changing 503 to 401", async () => {
    role = "DRIVER"; failingWrites = true; lookupFailure = true;
    const result = await call("/protected"); assert.equal(result.status, 503);
    assert.equal(result.body.code, "AUTH_SERVICE_UNAVAILABLE");
    await flushSessionEvents();
    assert(![...rows.values()].some(row => row.reason === "DATABASE_UNAVAILABLE"));
    failingWrites = false; lookupFailure = false;
    await flushSessionEvents();
    const entries = [...rows.values()].filter(row => row.reason === "DATABASE_UNAVAILABLE");
    assert.equal(entries.length, 1); assert.equal(entries[0].outcome, "CHECK_INTERRUPTED");
    assert.equal((await call("/protected")).status, 200);
  });

  await t.test("expired signed tokens identify the account; tampered tokens never attribute a logout", async () => {
    const expired = jwt.sign({ userId: "expired-staff", role: "DRIVER" }, process.env.JWT_SECRET, { expiresIn: -1 });
    const forged = jwt.sign({ userId: "victim", role: "DRIVER" }, "wrong-secret", { expiresIn: -1 });
    assert.equal((await call("/protected", "GET", undefined, expired)).status, 401);
    assert.equal((await call("/protected", "GET", undefined, forged)).status, 401);
    await flushSessionEvents();
    assert([...rows.values()].some(row => row.userId === "expired-staff" && row.reason === "TOKEN_EXPIRED"));
    assert(![...rows.values()].some(row => row.userId === "victim"));
  });

  await t.test("polling rejections are grouped and distinct causes stay distinguishable", async () => {
    active = false;
    for (let i = 0; i < 3; i++) assert.equal((await call("/protected")).status, 401);
    await flushSessionEvents();
    assert.equal([...rows.values()].filter(row => row.reason === "ACCOUNT_DEACTIVATED").length, 1);
    active = true; forced = new Date();
    assert.equal((await call("/protected")).status, 401);
    await flushSessionEvents();
    assert([...rows.values()].some(row => row.reason === "FORCE_LOGOUT")); forced = null;
  });

  await t.test("legacy driver exits are explicitly unknown, never inferred as manual or idle", async () => {
    role = "DRIVER";
    assert.equal((await call("/auth/driver/offline", "POST", {})).status, 200);
    await flushSessionEvents();
    const entry = [...rows.values()].find(row => row.reason === "DRIVER_OFFLINE_UNSPECIFIED");
    assert.equal(entry.userId, "staff");
    assert.equal(entry.reason, "DRIVER_OFFLINE_UNSPECIFIED"); assert.equal(entry.outcome, "OFFLINE_REPORTED");
    assert.equal((await call("/auth/driver/offline", "POST", { logoutReason: "INACTIVITY_TIMEOUT" })).status, 200);
    await flushSessionEvents();
    assert([...rows.values()].some(row => row.reason === "INACTIVITY_TIMEOUT" && row.outcome === "CLIENT_REPORTED"));
  });

  await t.test("successful force logout records target and actor before any client polls; failed actions do not", async () => {
    role = "ADMIN";
    assert.equal((await call("/auth/dispatchers/target/force-logout", "PATCH", {})).status, 200);
    await flushSessionEvents();
    const entry = [...rows.values()].find(row => row.userId === "target");
    assert.equal(entry.reason, "FORCE_LOGOUT"); assert.equal(entry.outcome, "ACCESS_REVOKED");
    assert.equal(entry.actorId, "staff"); assert.equal(entry.role, "DISPATCHER");
    actionSucceeds = false;
    assert.equal((await call("/auth/dispatchers/missing/force-logout", "PATCH", {})).status, 404);
    await flushSessionEvents();
    assert(![...rows.values()].some(row => row.userId === "missing")); actionSucceeds = true;
  });

  await t.test("read filters validate input and responses/logs exclude credentials and session fingerprints", async () => {
    role = "ADMIN";
    assert.equal((await call("/auth/session-log?page=-1")).status, 400);
    assert.equal((await call("/auth/session-log?role=CUSTOMER")).status, 400);
    const response = await call("/auth/session-log?role=DRIVER");
    assert.equal(response.status, 200); assert(response.body.events.every(row => row.role === "DRIVER"));
    const serialized = JSON.stringify(response.body) + info.join("\n");
    for (const secret of [token, "private@example.invalid", "private-password-hash", "private-device-data", "private database credentials", "eventKey"]) assert(!serialized.includes(secret), secret);
  });
});
