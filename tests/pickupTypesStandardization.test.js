const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PICKUP_TYPE_OPTIONS,
  ROUTABLE_PICKUP_TYPE_OPTIONS,
  parsePickupType,
  isRoutablePickupType
} = require("../dist/constants/pickupTypes");
const {
  buildPickupRequirement
} = require("../dist/controllers/driverOrders.controller");
const { prisma } = require("../dist/lib/prisma");
const {
  updateCatalogItemController
} = require("../dist/controllers/item.controller");

const makeResponse = () => {
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  return response;
};

test("official Pickup Type vocabulary is stable and complete", () => {
  assert.deepEqual(PICKUP_TYPE_OPTIONS, [
    "UNKNOWN",
    "CONVENIENCE",
    "BEER_STORE",
    "LCBO",
    "VAPE",
    "DISPENSARY"
  ]);

  assert.deepEqual(ROUTABLE_PICKUP_TYPE_OPTIONS, [
    "CONVENIENCE",
    "BEER_STORE",
    "LCBO",
    "VAPE",
    "DISPENSARY"
  ]);
});

test("legacy routing aliases are no longer recognized as official Pickup Types", () => {
  for (const legacyValue of ["GENERAL_RETAIL", "GROCERY", "PHARMACY", "OTHER"]) {
    assert.equal(parsePickupType(legacyValue), null);
    assert.equal(isRoutablePickupType(legacyValue), false);
  }
});

test("all official non-UNKNOWN Pickup Types are routable", () => {
  for (const pickupType of ROUTABLE_PICKUP_TYPE_OPTIONS) {
    assert.equal(parsePickupType(pickupType.toLowerCase()), pickupType);
    assert.equal(isRoutablePickupType(pickupType), true);
  }

  assert.equal(isRoutablePickupType("UNKNOWN"), false);
});

test("driver routing requirement uses the official Pickup Type vocabulary", () => {
  const requirement = buildPickupRequirement(
    [
      "LCBO",
      "beer_store",
      "VAPE",
      "DISPENSARY",
      "CONVENIENCE",
      "UNKNOWN",
      null,
      "GROCERY",
      "GROCERY"
    ],
    true
  );

  assert.deepEqual(requirement, {
    pickupRequired: true,
    routablePickupTypes: [
      "LCBO",
      "BEER_STORE",
      "VAPE",
      "DISPENSARY",
      "CONVENIENCE"
    ],
    unknownPickupItemCount: 2,
    unsupportedPickupTypeCount: 1
  });
});

test("catalog update rejects a non-standard Pickup Type", async (t) => {
  const originalFindUnique = prisma.itemCatalog.findUnique;
  const originalUpdate = prisma.itemCatalog.update;
  let updateCalled = false;

  prisma.itemCatalog.findUnique = async () => ({
    id: "item-1",
    name: "Sample Item"
  });
  prisma.itemCatalog.update = async () => {
    updateCalled = true;
    return {};
  };

  t.after(() => {
    prisma.itemCatalog.findUnique = originalFindUnique;
    prisma.itemCatalog.update = originalUpdate;
  });

  const req = {
    params: { id: "item-1" },
    body: { pickupType: "GROCERY" }
  };
  const res = makeResponse();

  await updateCatalogItemController(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, "Invalid pickup type");
  assert.equal(updateCalled, false);
});

test("catalog update normalizes and saves an official Pickup Type", async (t) => {
  const originalFindUnique = prisma.itemCatalog.findUnique;
  const originalUpdate = prisma.itemCatalog.update;
  let updateData;

  prisma.itemCatalog.findUnique = async () => ({
    id: "item-1",
    name: "Sample Item"
  });
  prisma.itemCatalog.update = async ({ data }) => {
    updateData = data;
    return { id: "item-1", ...data };
  };

  t.after(() => {
    prisma.itemCatalog.findUnique = originalFindUnique;
    prisma.itemCatalog.update = originalUpdate;
  });

  const req = {
    params: { id: "item-1" },
    body: { pickupType: " lcbo " }
  };
  const res = makeResponse();

  await updateCatalogItemController(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(updateData.pickupType, "LCBO");
});
