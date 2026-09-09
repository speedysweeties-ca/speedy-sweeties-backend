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
