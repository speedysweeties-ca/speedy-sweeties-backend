const assert = require("node:assert/strict");
const test = require("node:test");

const { prisma } = require("../dist/lib/prisma.js");
const {
  createPickupLocationController,
  listPickupLocationsController,
  updatePickupLocationController
} = require("../dist/controllers/pickupLocation.controller.js");

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

test("pickup location create rejects unsupported pickup types", async (t) => {
  let createCalled = false;
  replaceForTest(t, prisma.pickupLocation, "create", async () => {
    createCalled = true;
    return {};
  });

  const response = responseRecorder();
  await createPickupLocationController(
    {
      body: {
        name: "Example Store",
        pickupType: "NOT_REAL",
        addressLine1: "1 Example Street",
        city: "Guelph",
        province: "ON",
        latitude: 43.54,
        longitude: -80.25
      }
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(createCalled, false);
});

test("pickup location create persists optional postal code and normalized pickup type", async (t) => {
  let createArgs;
  replaceForTest(t, prisma.pickupLocation, "create", async (args) => {
    createArgs = args;
    return { id: "location-1", ...args.data };
  });

  const response = responseRecorder();
  await createPickupLocationController(
    {
      body: {
        name: "  Example LCBO  ",
        pickupType: "lcbo",
        addressLine1: "  10 Example Road  ",
        city: " Guelph ",
        province: " ON ",
        postalCode: " N1G 1A1 ",
        latitude: "43.5400",
        longitude: "-80.2500"
      }
    },
    response
  );

  assert.equal(response.statusCode, 201);
  assert.equal(createArgs.data.name, "Example LCBO");
  assert.equal(createArgs.data.pickupType, "LCBO");
  assert.equal(createArgs.data.postalCode, "N1G 1A1");
  assert.equal(createArgs.data.latitude, 43.54);
  assert.equal(createArgs.data.longitude, -80.25);
});

test("pickup location update can explicitly clear postal code", async (t) => {
  replaceForTest(t, prisma.pickupLocation, "findUnique", async () => ({
    id: "location-1",
    name: "Example Store"
  }));

  let updateArgs;
  replaceForTest(t, prisma.pickupLocation, "update", async (args) => {
    updateArgs = args;
    return { id: "location-1", ...args.data };
  });

  const response = responseRecorder();
  await updatePickupLocationController(
    {
      params: { id: "location-1" },
      body: { postalCode: "   " }
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(updateArgs.data.postalCode, null);
});

test("pickup location list rejects invalid pickup type filters", async (t) => {
  let findManyCalled = false;
  replaceForTest(t, prisma.pickupLocation, "findMany", async () => {
    findManyCalled = true;
    return [];
  });

  const response = responseRecorder();
  await listPickupLocationsController(
    { query: { pickupType: "NOT_REAL" } },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(findManyCalled, false);
});
