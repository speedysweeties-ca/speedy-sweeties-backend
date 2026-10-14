const assert = require("node:assert/strict");
const test = require("node:test");
const { prisma } = require("../dist/lib/prisma.js");
const { listAllOrdersController } = require("../dist/controllers/orderList.controller.js");

const responseRecorder = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

function replace(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

// Model the stored order snapshots, including orders predating customer linking.
function matches(order, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((clause) => matches(order, clause));
    if (key === "customer") return order.customer && matches(order.customer, value);
    if (key === "createdAt") return (!value.gte || order.createdAt >= value.gte) && (!value.lte || order.createdAt <= value.lte);
    if (value && typeof value === "object") {
      if (value.in) return value.in.includes(order[key]);
      if ("contains" in value) return String(order[key] || "").toLowerCase().includes(value.contains.toLowerCase());
    }
    return order[key] === value;
  });
}

function mockOrders(t, orders) {
  const queries = [];
  replace(t, prisma.order, "findMany", async (query) => {
    queries.push(query);
    assert.equal(query.include.assignedDriver.select.firstName, true);
    assert.equal(query.include.assignedDriver.select.lastName, true);
    return orders.filter((order) => matches(order, query.where)).slice(query.skip, query.skip + query.take);
  });
  replace(t, prisma.order, "count", async ({ where }) => orders.filter((order) => matches(order, where)).length);
  return queries;
}

const order = (id, extra = {}) => ({
  id, customerName: "Other Customer", phone: "(226) 555-0199", addressLine1: "99 Other Street",
  orderStatus: "DELIVERED", createdAt: new Date("2026-10-10T14:00:00Z"), priority: "NORMAL",
  assignedDriverId: "driver-1", assignedDriver: { id: "driver-1", firstName: "Test", lastName: "Driver" },
  customer: null, ...extra,
});

test("search finds an older unlinked customer's full history before pagination and keeps driver details", async (t) => {
  const otherOrders = Array.from({ length: 120 }, (_, i) => order(`other-${i}`));
  const matchingOrders = Array.from({ length: 105 }, (_, i) => order(`match-${i}`, { customerName: "Jane Example" }));
  const queries = mockOrders(t, [...otherOrders, ...matchingOrders]);
  replace(t, prisma, "$queryRaw", () => assert.fail("Names must not trigger a phone scan"));

  const first = responseRecorder();
  await listAllOrdersController({ query: { status: "DELIVERED", customerSearch: "  jAnE  " } }, first);
  assert.equal(first.body.totalCount, 105);
  assert.equal(first.body.totalPages, 2);
  assert.equal(first.body.orders.length, 100);
  assert.equal(first.body.orders[0].id, "match-0");
  assert.equal(first.body.orders[0].assignedDriver.firstName, "Test");

  const second = responseRecorder();
  await listAllOrdersController({ query: { status: "DELIVERED", customerSearch: "Jane", page: "2" } }, second);
  assert.deepEqual(second.body.orders.map(({ id }) => id), matchingOrders.slice(100).map(({ id }) => id));
  assert.equal(second.body.totalCount, 105);
  assert.deepEqual(queries[1].orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
});

test("address and current profile searches combine with status, multiple drivers, and dates", async (t) => {
  mockOrders(t, [
    order("a", { addressLine1: "12 Example Road" }),
    order("b", { addressLine1: "12 Example Road", assignedDriverId: "driver-2" }),
    order("cancelled", { addressLine1: "12 Example Road", orderStatus: "CANCELLED" }),
    order("driver-excluded", { addressLine1: "12 Example Road", assignedDriverId: "driver-3" }),
    order("date-excluded", { addressLine1: "12 Example Road", createdAt: new Date("2025-01-01T12:00:00Z") }),
    order("renamed", { customer: { fullName: "Jane Newname" } }),
  ]);
  const response = responseRecorder();
  await listAllOrdersController({ query: {
    status: "DELIVERED", customerSearch: "12 example", driverId: "driver-1,driver-2",
    startDate: "2026-10-01", endDate: "2026-10-12",
  } }, response);
  assert.deepEqual(response.body.orders.map(({ id }) => id), ["a", "b"]);
  assert.equal(response.body.totalCount, 2);

  const cancelled = responseRecorder();
  await listAllOrdersController({ query: { status: "CANCELLED", customerSearch: "example road" } }, cancelled);
  assert.deepEqual(cancelled.body.orders.map(({ id }) => id), ["cancelled"]);

  const renamed = responseRecorder();
  await listAllOrdersController({ query: { status: "DELIVERED", customerSearch: "Newname" } }, renamed);
  assert.deepEqual(renamed.body.orders.map(({ id }) => id), ["renamed"]);
});

test("formatted, unformatted, partial, and country-code phones find old snapshots and current customer profiles", async (t) => {
  mockOrders(t, [
    order("legacy-phone", { phone: "(519) 555-0123" }),
    order("current-phone", { customer: { fullName: "Jane", normalizedPhone: "15195550123" } }),
    order("unrelated"),
  ]);
  const boundValues = [];
  replace(t, prisma, "$queryRaw", async (sqlParts, ...values) => {
    assert.match(sqlParts.join("?"), /regexp_replace\("phone", '\[\^0-9\]', '', 'g'\) LIKE \?/);
    boundValues.push(...values);
    return [{ id: "legacy-phone" }];
  });
  for (const customerSearch of ["5195550123", "(519) 555-0123", "+1 (519) 555-0123", "555-0123"]) {
    const response = responseRecorder();
    await listAllOrdersController({ query: { status: "DELIVERED", customerSearch } }, response);
    assert.deepEqual(response.body.orders.map(({ id }) => id), ["legacy-phone", "current-phone"]);
  }
  assert.deepEqual(boundValues, ["%5195550123%", "%5195550123%", "%5195550123%", "%5550123%"]);
});

test("no match returns zero, clearing search restores history, and ordinary live orders retain priority sorting", async (t) => {
  mockOrders(t, [order("delivered"), order("cancelled", { orderStatus: "CANCELLED" }),
    order("normal", { orderStatus: "PLACED" }), order("urgent", { orderStatus: "PLACED", priority: "HIGH" })]);
  replace(t, prisma, "$queryRaw", () => assert.fail("Blank search must not scan phone numbers"));
  const noMatch = responseRecorder();
  await listAllOrdersController({ query: { status: "DELIVERED", customerSearch: "Nobody" } }, noMatch);
  assert.equal(noMatch.body.totalCount, 0);
  assert.deepEqual(noMatch.body.orders, []);
  const cleared = responseRecorder();
  await listAllOrdersController({ query: { status: "DELIVERED", customerSearch: "  " } }, cleared);
  assert.deepEqual(cleared.body.orders.map(({ id }) => id), ["delivered"]);
  const live = responseRecorder();
  await listAllOrdersController({ query: {} }, live);
  assert.deepEqual(live.body.orders.map(({ id }) => id), ["urgent", "normal"]);
});

test("invalid searches/pages are rejected before database access", async (t) => {
  replace(t, prisma.order, "findMany", () => assert.fail("Unexpected database access"));
  replace(t, prisma.order, "count", () => assert.fail("Unexpected database access"));
  replace(t, prisma, "$queryRaw", () => assert.fail("Unexpected database access"));
  for (const query of [
    { customerSearch: "a" }, { customerSearch: "x".repeat(201) },
    { customerSearch: ["Jane", "John"] }, { customerSearch: { contains: "Jane" } },
    { page: "-1" }, { page: "0" }, { page: "1.5" }, { page: "1oops" }, { page: ["1"] },
  ]) {
    const response = responseRecorder();
    await listAllOrdersController({ query }, response);
    assert.equal(response.statusCode, 400);
  }
});

test("search treats SQL LIKE wildcard characters literally", async (t) => {
  replace(t, prisma.order, "findMany", async ({ where }) => {
    assert.equal(where.OR[0].customerName.contains, "Test\\_100\\%");
    return [];
  });
  replace(t, prisma.order, "count", async () => 0);
  const response = responseRecorder();
  await listAllOrdersController({ query: { status: "DELIVERED", customerSearch: "Test_100%" } }, response);
  assert.equal(response.statusCode, 200);
});
