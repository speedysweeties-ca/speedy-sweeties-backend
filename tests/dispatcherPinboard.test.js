const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/pinboard_test";
process.env.JWT_SECRET = "pinboard-test-secret";
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "{}";
const express = require("express");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../dist/lib/prisma");
const { signAuthToken } = require("../dist/utils/jwt");
const routes = require("../dist/routes/dispatcherPinboard.routes").default;
const { errorHandler } = require("../dist/middleware/errorHandler");

test("private dispatcher pinboard supports posting, explicit read receipts and reversible resolution", async t => {
  const users = new Map(["admin", "alice", "bob", "driver"].map(id => [id, { id, firstName: id, lastName: "Fixture", email: `${id}@example.invalid`, role: id === "admin" ? "ADMIN" : id === "driver" ? "DRIVER" : "DISPATCHER", isActive: true, authVersion: 0 }]));
  const notes = new Map();
  const originals = [];
  const mock = (object, key, value) => { originals.push([object, key, object[key]]); object[key] = value; };
  t.after(() => originals.forEach(([object, key, value]) => { object[key] = value; }));
  const identity = id => users.has(id) ? { firstName: users.get(id).firstName, lastName: users.get(id).lastName } : null;
  const hydrate = note => note ? { ...note, author: identity(note.authorId), resolvedBy: identity(note.resolvedById), reads: note.reads.map(read => ({ ...read, user: identity(read.userId) })) } : null;
  const matches = (note, where) => (!where.status || where.status === note.status) && (!where.reads || !note.reads.some(read => read.userId === where.reads.none.userId));
  mock(prisma.user, "findUnique", async ({ where }) => users.get(where.id));
  mock(prisma.dispatcherNote, "findUnique", async ({ where }) => hydrate(notes.get(where.id)));
  mock(prisma.dispatcherNote, "count", async ({ where }) => [...notes.values()].filter(note => matches(note, where)).length);
  mock(prisma.dispatcherNote, "findMany", async ({ where, orderBy, skip, take }) => {
    assert.deepEqual(orderBy, [{ isImportant: "desc" }, { createdAt: "desc" }, { id: "desc" }]);
    assert.equal(take, 20);
    return [...notes.values()].filter(note => matches(note, where))
      .sort((a, b) => Number(b.isImportant) - Number(a.isImportant) || b.createdAt - a.createdAt || b.id.localeCompare(a.id))
      .slice(skip, skip + take).map(hydrate);
  });
  mock(prisma.dispatcherNote, "create", async ({ data }) => {
    if (notes.has(data.id)) throw new Prisma.PrismaClientKnownRequestError("Duplicate note", { code: "P2002", clientVersion: "test" });
    const note = { ...data, version: 0, status: "ACTIVE", createdAt: new Date(), resolvedAt: null, resolvedById: null,
      reads: [{ userId: data.reads.create.userId, readAt: new Date() }] };
    notes.set(note.id, note); return hydrate(note);
  });
  mock(prisma.dispatcherNoteRead, "upsert", async ({ where, update, create }) => {
    assert.deepEqual(update, {});
    const note = notes.get(where.noteId_userId.noteId);
    const existing = note.reads.find(read => read.userId === where.noteId_userId.userId);
    if (existing) return existing;
    const read = { ...create, readAt: new Date() }; note.reads.push(read); return read;
  });
  mock(prisma.dispatcherNote, "updateMany", async ({ where, data }) => {
    const note = notes.get(where.id);
    if (!note || note.version !== where.version || note.status !== where.status) return { count: 0 };
    Object.assign(note, data, { version: note.version + data.version.increment }); return { count: 1 };
  });
  const app = express(); app.use(express.json()); app.use("/board", routes); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/board`;
  const tokens = Object.fromEntries([...users.values()].map(user => [user.id, signAuthToken({ userId: user.id, email: user.email, role: user.role })]));
  const call = async (path, method = "GET", body, as = "alice") => {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(as ? { Authorization: `Bearer ${tokens[as]}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, cache: response.headers.get("Cache-Control"), body: await response.json() };
  };
  const draft = { id: randomUUID(), title: "  Shift handover  ", message: "  Please check the order notes before calling.  ", isImportant: true };

  await t.test("every route excludes public, driver, inactive, revoked and role-changed accounts", async () => {
    const paths = [["/summary", "GET"], ["/notes", "GET"], ["/notes", "POST", draft], [`/notes/${draft.id}/read`, "POST", {}], [`/notes/${draft.id}/status`, "PATCH", { status: "RESOLVED", version: 0 }]];
    for (const [path, method, body] of paths) {
      assert.equal((await call(path, method, body, null)).status, 401);
      assert.equal((await call(path, method, body, "driver")).status, 403);
    }
    users.get("alice").isActive = false; assert.equal((await call("/notes")).status, 401);
    users.get("alice").isActive = true; users.get("alice").authVersion = 1; assert.equal((await call("/notes")).status, 401);
    users.get("alice").authVersion = 0; users.get("alice").role = "DRIVER"; assert.equal((await call("/notes")).status, 403);
    users.get("alice").role = "DISPATCHER";
    assert.equal(notes.size, 0);
    assert.equal((await call("/notes", "GET", undefined, "admin")).status, 200);
  });

  await t.test("posts validate content, use the signed-in author, and retry without duplicate messages", async () => {
    for (const invalid of [{ title: " " }, { message: " " }, { title: "x".repeat(141) }, { message: "x".repeat(3001) }, { isImportant: "yes" }, { authorId: "bob" }, { id: "bad-id" }]) {
      assert.equal((await call("/notes", "POST", { ...draft, ...invalid })).status, 400);
    }
    const created = await call("/notes", "POST", draft);
    assert.equal(created.status, 201); assert.equal(created.cache, "no-store");
    assert.equal(created.body.note.title, "Shift handover"); assert.equal(created.body.note.message, "Please check the order notes before calling.");
    assert.equal(created.body.note.author.firstName, "alice"); assert.equal(created.body.note.hasRead, true);
    assert.equal(created.body.note.readBy.length, 1); assert.equal(created.body.note.author.email, undefined);
    assert.equal(created.body.note.authorId, undefined); assert.equal(created.body.note.reads, undefined);
    assert.equal((await call("/notes", "POST", draft)).status, 200); assert.equal(notes.size, 1);
    assert.equal((await call("/notes", "POST", { ...draft, message: "Changed retry" })).status, 409);
    assert.equal((await call("/notes", "POST", draft, "bob")).status, 409);
  });

  await t.test("viewing is not acknowledgement; reads are personal, explicit and idempotent", async () => {
    assert.equal((await call("/summary")).body.unreadTotal, 0);
    assert.equal((await call("/summary", "GET", undefined, "bob")).body.unreadTotal, 1);
    const viewed = await call("/notes", "GET", undefined, "bob"); assert.equal(viewed.body.notes[0].hasRead, false);
    assert.equal((await call("/summary", "GET", undefined, "bob")).body.unreadTotal, 1);
    assert.equal((await call(`/notes/${draft.id}/read`, "POST", { userId: "admin" }, "bob")).status, 400);
    assert.equal((await call(`/notes/${draft.id}/read`, "POST", {}, "bob")).status, 200);
    const timestamp = notes.get(draft.id).reads[1].readAt;
    assert.equal((await call(`/notes/${draft.id}/read`, "POST", {}, "bob")).status, 200);
    assert.equal(notes.get(draft.id).reads.length, 2); assert.equal(notes.get(draft.id).reads[1].readAt, timestamp);
    assert.equal((await call("/summary", "GET", undefined, "bob")).body.unreadTotal, 0);
    assert.equal((await call("/summary", "GET", undefined, "admin")).body.unreadTotal, 1);
    assert.equal((await call(`/notes/${randomUUID()}/read`, "POST", {})).status, 404);
  });

  await t.test("resolution preserves notes, identifies the resolver, supports reopening and detects stale changes", async () => {
    const path = `/notes/${draft.id}/status`;
    assert.equal((await call(path, "PATCH", { status: "RESOLVED", version: 0, resolvedById: "admin" })).status, 400);
    const resolved = await call(path, "PATCH", { status: "RESOLVED", version: 0 }, "bob");
    assert.equal(resolved.status, 200); assert.equal(resolved.body.note.resolvedBy.firstName, "bob"); assert(resolved.body.note.resolvedAt);
    assert.equal((await call("/notes")).body.total, 0); assert.equal((await call("/notes?status=RESOLVED")).body.total, 1);
    assert.equal((await call("/summary", "GET", undefined, "admin")).body.unreadTotal, 0);
    const repeated = await call(path, "PATCH", { status: "RESOLVED", version: 0 }, "admin");
    assert.equal(repeated.status, 200); assert.equal(repeated.body.note.resolvedBy.firstName, "bob");
    const reopened = await call(path, "PATCH", { status: "ACTIVE", version: 1 }, "admin");
    assert.equal(reopened.status, 200); assert.equal(reopened.body.note.version, 2); assert.equal(reopened.body.note.resolvedAt, null);
    assert.equal((await call(path, "PATCH", { status: "RESOLVED", version: 0 })).status, 409);
    assert.equal((await call(`/notes/${randomUUID()}/status`, "PATCH", { status: "RESOLVED", version: 0 })).status, 404);
    assert.equal((await call("/notes")).body.notes[0].message, "Please check the order notes before calling.");
  });

  await t.test("important notes stay first, page sizes are bounded, and old active notes carry across shifts", async () => {
    notes.get(draft.id).createdAt = new Date("2025-01-01T12:00:00Z");
    for (let i = 0; i < 21; i++) await call("/notes", "POST", { id: randomUUID(), title: `Routine note ${i}`, message: "Synthetic note", isImportant: false });
    const first = await call("/notes"); assert.equal(first.body.total, 22); assert.equal(first.body.notes.length, 20); assert.equal(first.body.notes[0].id, draft.id);
    const second = await call("/notes?page=2"); assert.equal(second.body.notes.length, 2);
    assert.equal(new Set([...first.body.notes, ...second.body.notes].map(note => note.id)).size, 22);
    for (const query of ["page=0", "page=-1", "page=1.5", "page=100001", "status=ALL"]) assert.equal((await call(`/notes?${query}`)).status, 400);
  });
});
