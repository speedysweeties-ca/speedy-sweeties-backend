const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/standards_test";
process.env.JWT_SECRET = "standards-test-secret";
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "{}";
const express = require("express");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../dist/lib/prisma");
const { signAuthToken } = require("../dist/utils/jwt");
const { STANDARDS_KEY } = require("../dist/services/dispatcherStandards.service");
const routes = require("../dist/routes/dispatcherStandards.routes").default;
const { errorHandler } = require("../dist/middleware/errorHandler");

test("dispatcher standards protect drafts and admin edits while persisting shared policy", async t => {
  const users = new Map(["admin", "dispatcher", "driver"].map(id => [id, {
    id, firstName: id, lastName: "Fixture", email: `${id}@example.invalid`,
    role: id.toUpperCase(), isActive: true, authVersion: 0,
  }]));
  let stored = null;
  let forceCreateConflict = false;
  let forceUpdateConflict = false;
  let databaseUnavailable = false;
  let writes = 0;
  const originals = [];
  const mock = (object, key, fn) => { originals.push([object, key, object[key]]); object[key] = fn; };
  t.after(() => originals.forEach(([object, key, value]) => { object[key] = value; }));
  mock(prisma.user, "findUnique", async ({ where }) => users.get(where.id));
  mock(prisma.systemSetting, "findUnique", async ({ where }) => {
    assert.equal(where.key, STANDARDS_KEY);
    if (databaseUnavailable) throw new Error("Database unavailable");
    return stored === null ? null : { key: STANDARDS_KEY, value: stored };
  });
  mock(prisma.systemSetting, "create", async ({ data }) => {
    assert.equal(data.key, STANDARDS_KEY);
    if (forceCreateConflict || stored !== null) throw new Prisma.PrismaClientKnownRequestError("Already exists", { code: "P2002", clientVersion: "test" });
    stored = data.value; writes++; return data;
  });
  mock(prisma.systemSetting, "updateMany", async ({ where, data }) => {
    assert.equal(where.key, STANDARDS_KEY);
    if (forceUpdateConflict || where.value !== stored) return { count: 0 };
    stored = data.value; writes++; return { count: 1 };
  });
  const app = express(); app.use(express.json()); app.use("/standards", routes); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/standards`;
  const tokens = Object.fromEntries([...users.values()].map(user => [user.id, signAuthToken({ userId: user.id, role: user.role, email: user.email })]));
  const call = async (path = "", method = "GET", body, as = "admin") => {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(as ? { Authorization: `Bearer ${tokens[as]}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, cache: response.headers.get("Cache-Control"), body: await response.json() };
  };
  let initial;
  let first;
  let second;
  const updateBody = (entry, version, changes = {}) => ({ title: entry.title, expectation: entry.expectation, consequence: entry.consequence, status: entry.status, version, ...changes });

  await t.test("public and drivers are excluded; dispatchers cannot write", async () => {
    for (const [path, method] of [["", "GET"], ["/entries", "POST"], [`/entries/${randomUUID()}`, "PUT"]]) {
      assert.equal((await call(path, method, method === "GET" ? undefined : {}, null)).status, 401);
      assert.equal((await call(path, method, method === "GET" ? undefined : {}, "driver")).status, 403);
      if (method !== "GET") assert.equal((await call(path, method, {}, "dispatcher")).status, 403);
    }
    users.get("admin").role = "DISPATCHER";
    assert.equal((await call("/entries", "POST", {})).status, 403);
    users.get("admin").role = "ADMIN";
    assert.equal(writes, 0);
  });

  await t.test("both $10 proposals start private and GET never writes a default policy", async () => {
    initial = (await call()).body;
    assert.equal(initial.version, 0); assert.equal(initial.canEdit, true);
    assert.equal(initial.entries.length, 2);
    assert(initial.entries.every(entry => entry.status === "DRAFT" && entry.consequence.includes("$10")));
    [first, second] = initial.entries;
    const staff = await call("", "GET", undefined, "dispatcher");
    assert.deepEqual(staff.body.entries, []); assert.equal(staff.body.canEdit, false);
    assert.equal(staff.cache, "no-store"); assert.equal(writes, 0);
  });

  await t.test("validation rejects invalid content, spoofed authors and status changes on creation", async () => {
    for (const invalid of [{ title: " " }, { title: "x".repeat(141) }, { expectation: "x".repeat(3001) }, { consequence: " " }, { status: "LIVE" }, { version: -1 }, { version: 0.5 }, { updatedBy: "Someone else" }]) {
      assert.equal((await call(`/entries/${first.id}`, "PUT", updateBody(first, 0, invalid))).status, 400);
    }
    assert.equal((await call("/entries/not-a-uuid", "PUT", updateBody(first, 0))).status, 400);
    assert.equal((await call("/entries", "POST", { ...updateBody(first, 0), id: randomUUID(), status: "PUBLISHED" })).status, 400);
    assert.equal((await call(`/entries/${randomUUID()}`, "PUT", updateBody(first, 0))).status, 404);
    assert.equal(writes, 0);
  });

  await t.test("first-save races return conflict and never overwrite another administrator", async () => {
    forceCreateConflict = true;
    assert.equal((await call(`/entries/${first.id}`, "PUT", updateBody(first, 0))).status, 409);
    assert.equal(writes, 0); forceCreateConflict = false;
  });

  await t.test("publishing persists server-attributed edits and exposes only published wording", async () => {
    const result = await call(`/entries/${first.id}`, "PUT", updateBody(first, 0, { status: "PUBLISHED", consequence: "  Manager review and coaching.  " }));
    assert.equal(result.status, 200); assert.equal(result.body.version, 1);
    const saved = result.body.entries[0];
    assert.equal(saved.consequence, "Manager review and coaching."); assert.equal(saved.updatedBy, "admin Fixture"); assert(saved.updatedAt);
    const fresh = await call(); assert.deepEqual(fresh.body, result.body);
    const staff = await call("", "GET", undefined, "dispatcher");
    assert.equal(staff.body.entries.length, 1); assert.equal(staff.body.entries[0].id, first.id);
    assert(!JSON.stringify(staff.body).includes("$10"));
    assert.equal(writes, 1);
  });

  await t.test("stale versions and compare-and-swap conflicts cannot erase saved policy", async () => {
    const before = stored;
    assert.equal((await call(`/entries/${second.id}`, "PUT", updateBody(second, 0))).status, 409);
    forceUpdateConflict = true;
    assert.equal((await call(`/entries/${second.id}`, "PUT", updateBody(second, 1))).status, 409);
    forceUpdateConflict = false;
    assert.equal(stored, before); assert.equal(writes, 1);
  });

  await t.test("archiving removes staff visibility, retains history and can be reversed", async () => {
    let saved = (await call()).body.entries[0];
    assert.equal((await call(`/entries/${first.id}`, "PUT", updateBody(saved, 1, { status: "ARCHIVED" }))).status, 200);
    assert.deepEqual((await call("", "GET", undefined, "dispatcher")).body.entries, []);
    saved = (await call()).body.entries[0]; assert.equal(saved.status, "ARCHIVED");
    assert.equal((await call(`/entries/${first.id}`, "PUT", updateBody(saved, 2, { status: "PUBLISHED" }))).status, 200);
    assert.equal((await call("", "GET", undefined, "dispatcher")).body.entries.length, 1);
  });

  await t.test("adding and retrying a draft is idempotent and does not expose it to staff", async () => {
    const draft = { id: randomUUID(), title: "  Shift handover  ", expectation: "Read the pinboard.", consequence: "Manager follow-up.", status: "DRAFT", version: 3 };
    const added = await call("/entries", "POST", draft);
    assert.equal(added.status, 201); assert.equal(added.body.entries.length, 3); assert.equal(added.body.version, 4);
    assert.equal(added.body.entries[2].title, "Shift handover");
    assert.equal((await call("/entries", "POST", draft)).status, 201);
    assert.equal((await call()).body.version, 4); assert.equal((await call()).body.entries.length, 3);
    assert.equal((await call("/entries", "POST", { ...draft, title: "Different retry" })).status, 409);
    assert.equal((await call("", "GET", undefined, "dispatcher")).body.entries.length, 1);
  });

  await t.test("storage failures and corrupt saved data never silently revert to starter drafts", async () => {
    const before = stored; const beforeWrites = writes;
    databaseUnavailable = true;
    assert.equal((await call()).status, 500);
    assert.equal((await call(`/entries/${first.id}`, "PUT", updateBody(first, 4))).status, 500);
    databaseUnavailable = false;
    for (const corrupt of ["not json", JSON.stringify({ version: 0, entries: [] }).replace('"entries"', '"wrong"')]) {
      stored = corrupt;
      assert.equal((await call()).status, 503);
      assert.equal((await call(`/entries/${first.id}`, "PUT", updateBody(first, 4))).status, 503);
      assert.equal(stored, corrupt);
    }
    stored = before; assert.equal(writes, beforeWrites);
    assert.equal((await call()).body.entries.length, 3);
  });
});
