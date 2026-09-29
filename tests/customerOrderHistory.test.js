const assert = require("node:assert/strict");
const test = require("node:test");
const { prisma } = require("../dist/lib/prisma.js");
const { getCustomerByIdController } = require("../dist/controllers/customer.controller.js");

const responseRecorder = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

// Prisma exposes model methods through a proxy rather than own properties.
const replaceCustomerLookup = (t, replacement) => {
  const original = prisma.customer.findUnique;
  prisma.customer.findUnique = replacement;
  const restore = () => { prisma.customer.findUnique = original; };
  t.after(restore);
  return restore;
};

test("customer history keeps its 20-order response and pages older orders without repeats", async (t) => {
  const orders = Array.from({ length: 24 }, (_, i) => ({
    id: `order-${24 - i}`, orderNumber: 24 - i,
    createdAt: "2026-09-28T17:00:00Z", deliveredAt: "2026-09-28T17:30:00Z",
    items: [{ name: "Pop", quantity: i === 23 ? 2 : 1 }],
  }));
  replaceCustomerLookup(t, async (query) => {
    assert.deepEqual(query.where, { id: "customer-1" });
    const history = query.include.orders;
    assert.deepEqual(history.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
    assert.equal(history.select.deliveredAt, true);
    assert.equal(history.select.items.select.quantity, true);
    const start = history.cursor
      ? orders.findIndex((order) => order.id === history.cursor.id) + history.skip
      : 0;
    return { id: "customer-1", fullName: "Test Customer", orders: orders.slice(start, start + history.take) };
  });

  const first = responseRecorder();
  await getCustomerByIdController({ params: { id: "customer-1" }, query: {} }, first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.customer.fullName, "Test Customer");
  assert.deepEqual(first.body.customer.orders, orders.slice(0, 20));
  assert.equal(first.body.nextOrdersCursor, orders[19].id);

  const second = responseRecorder();
  await getCustomerByIdController({
    params: { id: "customer-1" }, query: { ordersCursor: first.body.nextOrdersCursor },
  }, second);
  assert.deepEqual(second.body.customer.orders, orders.slice(20));
  assert.equal(second.body.nextOrdersCursor, null);
});

test("history with exactly 20 orders or no orders has no next page", async (t) => {
  for (const count of [0, 20]) {
    const orders = Array.from({ length: count }, (_, i) => ({ id: `order-${i}` }));
    const restore = replaceCustomerLookup(t, async () => ({ id: "customer-1", orders }));
    const response = responseRecorder();
    await getCustomerByIdController({ params: { id: "customer-1" }, query: {} }, response);
    assert.equal(response.body.nextOrdersCursor, null);
    assert.deepEqual(response.body.customer.orders, orders);
    restore();
  }
});

test("invalid history cursors are rejected before querying the database", async (t) => {
  replaceCustomerLookup(t, async () => assert.fail("Unexpected database call"));
  for (const ordersCursor of ["", " ", "x".repeat(201), ["order-1"], { id: "order-1" }]) {
    const response = responseRecorder();
    await getCustomerByIdController({ params: { id: "customer-1" }, query: { ordersCursor } }, response);
    assert.equal(response.statusCode, 400);
  }
});

test("missing customers retain the existing not-found response", async (t) => {
  replaceCustomerLookup(t, async () => null);
  const response = responseRecorder();
  await getCustomerByIdController({ params: { id: "missing" }, query: {} }, response);
  assert.equal(response.statusCode, 404);
});
