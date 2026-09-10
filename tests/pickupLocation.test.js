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

test("pickup location create rejects unsupported and UNKNOWN pickup types", async (t) => {
  let createCalled = false;
  replaceForTest(t, prisma.pickupLocation, "create", async () => {
    createCalled = true;
    return {};
  });

  for (const pickupType of ["NOT_REAL", "UNKNOWN"]) {
    const response = responseRecorder();
    await createPickupLocationController(
      {
        body: {
          name: "Example Store",
          pickupType,
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
  }

  assert.equal(createCalled, false);
});

test("pickup location create persists postal code and normalized pickup type", async (t) => {
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
  assert.equal(createArgs.data.routingPriority, "STANDARD");
});

test("pickup location priority survives create, edit, list, and API response", async (t) => {
  let storedLocation;
  replaceForTest(t, prisma.pickupLocation, "create", async ({ data }) => {
    storedLocation = { id: "location-1", ...data };
    return storedLocation;
  });
  replaceForTest(t, prisma.pickupLocation, "findUnique", async () => storedLocation);
  replaceForTest(t, prisma.pickupLocation, "update", async ({ data }) => {
    storedLocation = { ...storedLocation, ...data };
    return storedLocation;
  });
  replaceForTest(t, prisma.pickupLocation, "findMany", async () => [storedLocation]);

  const createResponse = responseRecorder();
  await createPickupLocationController(
    {
      body: {
        name: "Preferred Store",
        pickupType: "LCBO",
        addressLine1: "1 Example Street",
        city: "Guelph",
        province: "ON",
        latitude: 43.54,
        longitude: -80.25,
        routingPriority: "PREFERRED"
      }
    },
    createResponse
  );

  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.body.location.routingPriority, "PREFERRED");

  const updateResponse = responseRecorder();
  await updatePickupLocationController(
    {
      params: { id: "location-1" },
      body: { routingPriority: "FALLBACK" }
    },
    updateResponse
  );

  assert.equal(updateResponse.statusCode, 200);
  assert.equal(updateResponse.body.location.routingPriority, "FALLBACK");

  const listResponse = responseRecorder();
  await listPickupLocationsController({ query: {} }, listResponse);

  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.body.locations[0].routingPriority, "FALLBACK");
});

test("pickup location create and update reject invalid routing priority", async (t) => {
  let createCalled = false;
  let updateCalled = false;
  replaceForTest(t, prisma.pickupLocation, "create", async () => {
    createCalled = true;
    return {};
  });
  replaceForTest(t, prisma.pickupLocation, "findUnique", async () => ({
    id: "location-1",
    googlePlaceId: null
  }));
  replaceForTest(t, prisma.pickupLocation, "update", async () => {
    updateCalled = true;
    return {};
  });

  const createResponse = responseRecorder();
  await createPickupLocationController(
    {
      body: {
        name: "Example Store",
        pickupType: "LCBO",
        addressLine1: "1 Example Street",
        city: "Guelph",
        province: "ON",
        latitude: 43.54,
        longitude: -80.25,
        routingPriority: "FASTEST"
      }
    },
    createResponse
  );
  const updateResponse = responseRecorder();
  await updatePickupLocationController(
    {
      params: { id: "location-1" },
      body: { routingPriority: "FASTEST" }
    },
    updateResponse
  );

  assert.equal(createResponse.statusCode, 400);
  assert.equal(updateResponse.statusCode, 400);
  assert.equal(createCalled, false);
  assert.equal(updateCalled, false);
});

test("pickup location update can clear postal code", async (t) => {
  replaceForTest(t, prisma.pickupLocation, "findUnique", async () => ({
    id: "location-1",
    googlePlaceId: null
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

test("pickup location update rejects UNKNOWN without writing", async (t) => {
  replaceForTest(t, prisma.pickupLocation, "findUnique", async () => ({
    id: "location-1",
    googlePlaceId: null
  }));

  let updateCalled = false;
  replaceForTest(t, prisma.pickupLocation, "update", async () => {
    updateCalled = true;
    return {};
  });

  const response = responseRecorder();
  await updatePickupLocationController(
    {
      params: { id: "location-1" },
      body: { pickupType: "UNKNOWN" }
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(updateCalled, false);
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
