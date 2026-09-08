const assert = require("node:assert/strict");
const test = require("node:test");
const { OrderStatus } = require("@prisma/client");

const {
  ROUTING_PREVIEW_PICKUP_TYPES,
  normalizeRoutingPickupType,
  buildRoutingPickupRequirement
} = require("../dist/controllers/routingPreview.controller.js");

test("routing preview uses the official five routable pickup types", () => {
  assert.deepEqual(ROUTING_PREVIEW_PICKUP_TYPES, [
    "CONVENIENCE",
    "BEER_STORE",
    "LCBO",
    "VAPE",
    "DISPENSARY"
  ]);
});

test("routing preview normalizes pickup type values", () => {
  assert.equal(normalizeRoutingPickupType(" lcbo "), "LCBO");
  assert.equal(normalizeRoutingPickupType("beer_store"), "BEER_STORE");
  assert.equal(normalizeRoutingPickupType(null), "UNKNOWN");
});

test("routing preview collects required pickup types and unknown items", () => {
  const result = buildRoutingPickupRequirement(
    [
      { itemCatalog: { pickupType: "LCBO" } },
      { itemCatalog: { pickupType: "dispensary" } },
      { itemCatalog: { pickupType: "LCBO" } },
      { itemCatalog: { pickupType: "UNKNOWN" } },
      { itemCatalog: null }
    ],
    OrderStatus.PLACED
  );

  assert.equal(result.pickupRequired, true);
  assert.deepEqual(result.requiredPickupTypes, ["LCBO", "DISPENSARY"]);
  assert.equal(result.unknownPickupItemCount, 2);
  assert.deepEqual(result.unsupportedPickupTypes, []);
});

test("routing preview reports legacy unsupported pickup values instead of routing them", () => {
  const result = buildRoutingPickupRequirement(
    [
      { itemCatalog: { pickupType: "GROCERY" } },
      { itemCatalog: { pickupType: "PHARMACY" } },
      { itemCatalog: { pickupType: "VAPE" } }
    ],
    OrderStatus.ACCEPTED
  );

  assert.deepEqual(result.requiredPickupTypes, ["VAPE"]);
  assert.deepEqual(result.unsupportedPickupTypes, ["GROCERY", "PHARMACY"]);
});

test("out-for-delivery orders preview direct-to-customer routing", () => {
  const result = buildRoutingPickupRequirement(
    [{ itemCatalog: { pickupType: "LCBO" } }],
    OrderStatus.OUT_FOR_DELIVERY
  );

  assert.equal(result.pickupRequired, false);
  assert.deepEqual(result.requiredPickupTypes, []);
});
