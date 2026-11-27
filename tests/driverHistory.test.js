const assert = require("node:assert/strict");
const test = require("node:test");
const { prisma } = require("../dist/lib/prisma");
const { getDriverHistoryController } = require("../dist/controllers/driverHistory.controller");

const request = (query = {}, user = { userId: "driver-a", role: "DRIVER" }) => ({
  user, query: { startDate: "2026-11-01", endDate: "2026-11-01", ...query }
});
const response = () => ({
  statusCode: 200, headers: {}, body: null,
  set(key, value) { this.headers[key] = value; return this; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});
function replace(t, target, key, value) {
  const original = target[key]; target[key] = value;
  t.after(() => { target[key] = original; });
}

test("history scopes records AND totals to the session driver before pagination and only selects summary fields", async t => {
  const start = new Date("2026-11-01T04:00:00Z");
  const end = new Date("2026-11-02T05:00:00Z"); // Fall DST: 25-hour Toronto day.
  const fixtures = Array.from({ length: 55 }, (_, i) => ({
    id: `own-${String(i).padStart(2, "0")}`, assignedDriverId: "driver-a", orderStatus: "DELIVERED",
    deliveredAt: new Date(start.getTime() + i * 60000), phone: "private", buzzCode: "private"
  }));
  fixtures.push(
    { id: "other", assignedDriverId: "driver-b", orderStatus: "DELIVERED", deliveredAt: start },
    { id: "cancelled", assignedDriverId: "driver-a", orderStatus: "CANCELLED", deliveredAt: start },
    { id: "active", assignedDriverId: "driver-a", orderStatus: "ACCEPTED", deliveredAt: null },
    { id: "before", assignedDriverId: "driver-a", orderStatus: "DELIVERED", deliveredAt: new Date(start - 1) },
    { id: "last-ms", assignedDriverId: "driver-a", orderStatus: "DELIVERED", deliveredAt: new Date(end - 1) },
    { id: "next-day", assignedDriverId: "driver-a", orderStatus: "DELIVERED", deliveredAt: end }
  );
  function matching(where) {
    assert.deepEqual(where, { assignedDriverId: "driver-a", orderStatus: "DELIVERED", deliveredAt: { gte: start, lt: end } });
    return fixtures.filter(row => row.assignedDriverId === where.assignedDriverId && row.orderStatus === where.orderStatus &&
      row.deliveredAt >= where.deliveredAt.gte && row.deliveredAt < where.deliveredAt.lt)
      .sort((a, b) => b.deliveredAt - a.deliveredAt || b.id.localeCompare(a.id));
  }
  replace(t, prisma.order, "count", async ({ where }) => matching(where).length);
  replace(t, prisma.order, "findMany", async query => {
    assert.deepEqual(query.orderBy, [{ deliveredAt: "desc" }, { id: "desc" }]);
    assert.equal(query.take, 50);
    assert.deepEqual(Object.keys(query.select).sort(), ["addressLine1", "city", "customerName", "deliveredAt", "id", "orderNumber"]);
    return matching(query.where).slice(query.skip, query.skip + query.take)
      .map(row => Object.fromEntries(Object.keys(query.select).map(key => [key, row[key]])));
  });
  const first = response();
  await getDriverHistoryController(request({ driverId: "driver-b", driverIds: "driver-b", assignedDriverId: "driver-b", status: "CANCELLED" }), first);
  assert.equal(first.body.totalCount, 56);
  assert.equal(first.body.orders.length, 50);
  assert.equal(first.body.totalPages, 2);
  assert.equal(first.body.orders[0].id, "last-ms");
  assert.equal(first.headers["Cache-Control"], "no-store");
  const second = response();
  await getDriverHistoryController(request({ page: "2" }), second);
  assert.equal(second.body.orders.length, 6);
  assert.equal(new Set([...first.body.orders, ...second.body.orders].map(row => row.id)).size, 56);
});

test("spring DST, winter and summer boundaries include both selected calendar dates", async t => {
  replace(t, prisma.order, "count", async () => 0);
  let where;
  replace(t, prisma.order, "findMany", async query => { where = query.where; return []; });
  for (const [day, start, end] of [
    ["2026-03-08", "2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z"],
    ["2026-01-01", "2026-01-01T05:00:00.000Z", "2026-01-02T05:00:00.000Z"],
    ["2026-07-01", "2026-07-01T04:00:00.000Z", "2026-07-02T04:00:00.000Z"]
  ]) {
    const res = response();
    await getDriverHistoryController(request({ startDate: day, endDate: day }), res);
    assert.equal(where.deliveredAt.gte.toISOString(), start);
    assert.equal(where.deliveredAt.lt.toISOString(), end);
    assert.equal(res.body.totalCount, 0);
    assert.equal(res.body.totalPages, 0);
    assert.deepEqual(res.body.orders, []);
  }
});

test("invalid dates, reversed ranges and malformed pages never query orders", async t => {
  replace(t, prisma.order, "findMany", () => assert.fail("Unexpected query"));
  replace(t, prisma.order, "count", () => assert.fail("Unexpected count"));
  for (const query of [
    { startDate: undefined }, { endDate: undefined }, { startDate: "2026-02-30" },
    { startDate: "2026-2-01" }, { startDate: ["2026-11-01"] }, { endDate: {} },
    { startDate: "2026-11-02" }, { page: "0" }, { page: "-1" }, { page: "1.5" },
    { page: "1oops" }, { page: ["1"] }, { page: "999999999999999" }
  ]) {
    const res = response(); await getDriverHistoryController(request(query), res);
    assert.equal(res.statusCode, 400, JSON.stringify(query));
  }
});

test("unauthenticated and non-driver requests fail before any order read", async t => {
  replace(t, prisma.order, "findMany", () => assert.fail("Unexpected query"));
  replace(t, prisma.order, "count", () => assert.fail("Unexpected count"));
  for (const [user, code] of [[null, 401], [{ role: "DRIVER" }, 401], [{ userId: "admin", role: "ADMIN" }, 403], [{ userId: "dispatcher", role: "DISPATCHER" }, 403]]) {
    const res = response(); await getDriverHistoryController(request({}, user), res);
    assert.equal(res.statusCode, code);
  }
});

test("mounted history route authenticates the session and rejects other staff roles", async t => {
  const express = require("express");
  const { signAuthToken } = require("../dist/utils/jwt");
  const driverRouter = require("../dist/routes/driver.routes").default;
  const app = express();
  app.use("/driver", driverRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  replace(t, prisma.user, "findUnique", async ({ where }) => ({
    id: where.id, role: where.id === "driver-a" ? "DRIVER" : "DISPATCHER",
    email: "synthetic@example.invalid", isActive: true, authVersion: 0,
    passwordChangeRequired: false, forceLogoutAt: null
  }));
  let queries = 0;
  replace(t, prisma.order, "findMany", async ({ where }) => {
    queries++; assert.equal(where.assignedDriverId, "driver-a"); return [];
  });
  replace(t, prisma.order, "count", async ({ where }) => {
    assert.equal(where.assignedDriverId, "driver-a"); return 0;
  });
  const url = `http://127.0.0.1:${server.address().port}/driver/history?startDate=2026-11-01&endDate=2026-11-01&driverId=driver-b`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { Authorization: "Bearer invalid" } })).status, 401);
  const token = id => signAuthToken({ userId: id, role: "DRIVER", email: "synthetic@example.invalid", authVersion: 0 });
  // The current database role wins even when a token says DRIVER.
  assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${token("dispatcher")}` } })).status, 403);
  assert.equal(queries, 0);
  assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${token("driver-a")}` } })).status, 200);
  assert.equal(queries, 1);
});
