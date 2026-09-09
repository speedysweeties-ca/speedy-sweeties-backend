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
