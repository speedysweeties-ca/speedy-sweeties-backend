const assert = require("node:assert/strict");
const test = require("node:test");

const { prisma } = require("../dist/lib/prisma.js");
const {
  getDriverOrdersController
} = require("../dist/controllers/driverOrders.controller.js");

const responseRecorder = () => {
  const result = {
    statusCode: 200,
    body: undefined,
    status(code) {
      result.statusCode = code;
      return result;
    },
    json(body) {
      result.body = body;
      return result;
    }
  };

  return result;
};

const replaceForTest = (t, target, property, replacement) => {
  const original = target[property];
  target[property] = replacement;
  t.after(() => {
    target[property] = original;
  });
};

test("driver fallback candidates query only active operational pickup locations", async (t) => {
  replaceForTest(t, prisma.order, "findMany", async () => [
    {
      id: "order-1",
      orderStatus: "PLACED",
      addressLine1: "1 Destination Street",
      unitNumber: "4B",
      buzzCode: "1234",
      city: "Guelph",
      province: "ON",
      postalCode: "N1G 1A1",
      items: [{ itemCatalog: { pickupType: "DISPENSARY" } }],
      pickupStops: []
    }
  ]);

  let pickupLocationQuery;
  replaceForTest(t, prisma.pickupLocation, "findMany", async (args) => {
    pickupLocationQuery = args;
    return [
      {
        id: "store-1",
        name: "Operational Store",
        pickupType: "DISPENSARY",
        addressLine1: "2 Store Street",
        city: "Guelph",
        province: "ON",
        postalCode: null,
        latitude: 43.54,
        longitude: -80.25
      }
    ];
  });

  const response = responseRecorder();
  await getDriverOrdersController(
    {
      user: {
        userId: "driver-1",
        email: "driver@example.com",
        role: "DRIVER"
      }
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(pickupLocationQuery.where, {
    isActive: true,
    pickupType: { in: ["DISPENSARY"] },
    OR: [
      { googleBusinessStatus: null },
      { googleBusinessStatus: "OPERATIONAL" }
    ]
  });
  assert.equal(
    response.body.orders[0].routingPlan.pickupLocationCandidates[0].id,
    "store-1"
  );
  assert.equal(response.body.orders[0].routingPlan.destination.unitNumber, "4B");
  assert.equal(response.body.orders[0].routingPlan.destination.buzzCode, "1234");
});

test("driver orders preserve the assigned pickup-stop response fields and sequence", async (t) => {
  const assignedPickupStops = [
    {
      id: "stop-1",
      pickupType: "BEER_STORE",
      sequence: 1,
      storeName: "First Store",
      addressLine1: "1 Store Street",
      city: "Guelph",
      province: "ON",
      latitude: 43.54,
      longitude: -80.25,
      projectedArrivalAt: new Date("2026-09-08T16:05:00.000Z"),
      closingTime: "20:00",
      closingBufferMinutes: 3
    },
    {
      id: "stop-2",
      pickupType: "LCBO",
      sequence: 2,
      storeName: "Second Store",
      addressLine1: "2 Store Street",
      city: "Guelph",
      province: "ON",
      latitude: 43.55,
      longitude: -80.24,
      projectedArrivalAt: new Date("2026-09-08T16:12:00.000Z"),
      closingTime: "21:00",
      closingBufferMinutes: 3
    }
  ];

  replaceForTest(t, prisma.order, "findMany", async () => [
    {
      id: "order-1",
      orderStatus: "PLACED",
      addressLine1: "1 Destination Street",
      unitNumber: null,
      buzzCode: null,
      city: "Guelph",
      province: "ON",
      postalCode: "N1G 1A1",
      items: [{ itemCatalog: { pickupType: "BEER_STORE" } }],
      pickupStops: assignedPickupStops
    }
  ]);
  replaceForTest(t, prisma.pickupLocation, "findMany", async () => []);

  const response = responseRecorder();
  await getDriverOrdersController(
    {
      user: {
        userId: "driver-1",
        email: "driver@example.com",
        role: "DRIVER"
      }
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.body.orders[0].routingPlan.assignedPickupStops,
    assignedPickupStops
  );
  assert.deepEqual(
    response.body.orders[0].routingPlan.assignedPickupStops.map((stop) => stop.sequence),
    [1, 2]
  );
});

for (const variant of ['matching', 'removed', 'quantity', 'legacy']) {
  test(`reopened driver receipt reports whether its saved total belongs to current items: ${variant}`, async t => {
    const { receiptItemsFingerprint } = require('../dist/services/receiptItems.service');
    const original = [{ id: 'a', name: 'Item A', quantity: 1 }, { id: 'b', name: 'Item B', quantity: 1 }];
    const items = variant === 'removed' ? [original[0]] : variant === 'quantity' ? [{ ...original[0], quantity: 2 }, original[1]] : [...original].reverse();
    replaceForTest(t, prisma.order, 'findMany', async () => [{
      id: 'order-1', orderStatus: 'OUT_FOR_DELIVERY', items, pickupStops: [],
      digitalReceipt: { itemTotal: '40.00', deliveryCharge: '22.02',
        itemsFingerprint: variant === 'legacy' ? null : receiptItemsFingerprint(original) }
    }]);
    replaceForTest(t, prisma.pickupLocation, 'findMany', async () => []);
    const response = responseRecorder();
    await getDriverOrdersController({ user: { userId: 'driver-1', role: 'DRIVER' } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.orders[0].receiptItemsCurrent, variant === 'matching');
    assert.equal(response.body.orders[0].digitalReceipt.deliveryCharge, '22.02');
  });
}
