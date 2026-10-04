const assert = require("node:assert/strict");
const test = require("node:test");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/staff_registration_test";
process.env.JWT_SECRET = "staff-registration-test-secret";
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "{}";

const express = require("express");
const { prisma } = require("../dist/lib/prisma.js");
const routes = require("../dist/routes/auth.routes.js").default;
const { errorHandler } = require("../dist/middleware/errorHandler.js");
const { signAuthToken, verifyAuthToken } = require("../dist/utils/jwt.js");
const { comparePassword } = require("../dist/utils/hash.js");

test("staff creation enforces administrator access, validates details, and creates usable driver and dispatcher sign-ins", async t => {
  const accounts = new Map();
  let actor = { id: "admin-fixture", email: "owner@example.invalid", role: "ADMIN", isActive: true };
  let writes = 0;
  const originals = [];
  const mock = (method, implementation) => {
    originals.push([method, prisma.user[method]]);
    prisma.user[method] = implementation;
  };
  t.after(() => originals.forEach(([method, original]) => { prisma.user[method] = original; }));
  mock("findUnique", async ({ where }) => where.id === actor.id
    ? actor
    : where.email ? accounts.get(where.email) ?? null : [...accounts.values()].find(user => user.id === where.id) ?? null);
  mock("create", async ({ data, select }) => {
    writes++;
    const user = { ...data, id: `staff-${writes}`, isActive: true, isVisibleInDispatch: true, isOnline: false, createdAt: new Date(), updatedAt: new Date() };
    accounts.set(user.email, user);
    return Object.fromEntries(Object.keys(select).map(key => [key, user[key]]));
  });
  mock("update", async ({ where, data }) => {
    const user = [...accounts.values()].find(value => value.id === where.id);
    assert(user); Object.assign(user, data); return user;
  });

  const app = express(); app.use(express.json()); app.use("/auth", routes); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/auth`;
  const adminToken = signAuthToken({ userId: actor.id, email: actor.email, role: "ADMIN" });
  const call = (path, body, token = adminToken) => fetch(base + path, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
  const profile = { email: "new.driver@example.invalid", password: "Fixture-only-password", role: "DRIVER", firstName: "New", lastName: "Driver" };

  assert.equal((await call("/register", profile, null)).status, 401);
  for (const role of ["DISPATCHER", "DRIVER"]) {
    actor.role = role;
    // A signed token claiming ADMIN cannot override the current database role.
    assert.equal((await call("/register", profile)).status, 403);
  }
  actor.role = "ADMIN"; actor.isActive = false;
  assert.equal((await call("/register", profile)).status, 401);
  actor.isActive = true;
  for (const change of [{ email: "invalid" }, { password: "short" }, { role: "OWNER" }, { firstName: " " }]) {
    assert.equal((await call("/register", { ...profile, ...change })).status, 400);
  }
  assert.equal(writes, 0);

  for (const role of ["DRIVER", "DISPATCHER"]) {
    const email = `new.${role.toLowerCase()}@example.invalid`;
    const response = await call("/register", { ...profile, email: `  ${email.toUpperCase()}  `, role, firstName: "  New  ", lastName: "  Staff  " });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.user.email, email); assert.equal(body.user.role, role);
    assert.equal(body.user.firstName, "New"); assert.equal(body.user.lastName, "Staff");
    assert.equal(body.user.isOnline, false);
    assert.equal(body.token, undefined); assert.equal(body.user.password, undefined); assert.equal(body.user.passwordHash, undefined);
    assert(await comparePassword(profile.password, accounts.get(email).passwordHash));
    assert.notEqual(accounts.get(email).passwordHash, profile.password);
    assert.equal((await call("/register", { ...profile, email: email.toUpperCase(), role })).status, 409);

    const login = await call("/login", { email, password: profile.password }, null);
    assert.equal(login.status, 200);
    const signedIn = verifyAuthToken((await login.json()).token);
    assert.equal(signedIn.role, role); assert.equal(signedIn.userId, body.user.id);
  }
  assert.equal(writes, 2);
});
