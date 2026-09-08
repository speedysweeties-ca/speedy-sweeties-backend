const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GUELPH_CORE_PICKUP_LOCATIONS
} = require("../dist/data/guelphPickupLocations.js");
const {
  GUELPH_CONVENIENCE_PICKUP_LOCATIONS
} = require("../dist/data/guelphConveniencePickupLocations.js");

const allLocations = [
  ...GUELPH_CORE_PICKUP_LOCATIONS,
  ...GUELPH_CONVENIENCE_PICKUP_LOCATIONS
];

const officialPickupTypes = new Set([
  "LCBO",
  "BEER_STORE",
  "VAPE",
  "DISPENSARY",
  "CONVENIENCE"
]);

test("Guelph pickup dataset has the expected verified category counts", () => {
  const counts = Object.fromEntries(
    [...officialPickupTypes].map((pickupType) => [
      pickupType,
      allLocations.filter((location) => location.pickupType === pickupType).length
    ])
  );

  assert.equal(allLocations.length, 57);
  assert.deepEqual(counts, {
    LCBO: 5,
    BEER_STORE: 4,
    VAPE: 7,
    DISPENSARY: 23,
    CONVENIENCE: 18
  });
});

test("Guelph pickup dataset uses only official non-UNKNOWN pickup types", () => {
  for (const location of allLocations) {
    assert.equal(officialPickupTypes.has(location.pickupType), true);
    assert.notEqual(location.pickupType, "UNKNOWN");
    assert.equal(location.city, "Guelph");
    assert.equal(location.province, "ON");
    assert.equal(Boolean(location.verificationSource), true);

    if (location.postalCode) {
      assert.match(location.postalCode, /^[A-Z]\d[A-Z] \d[A-Z]\d$/);
    }
  }
});

test("Guelph pickup dataset contains no duplicate names", () => {
  const names = allLocations.map((location) => location.name.toLowerCase());

  assert.equal(new Set(names).size, names.length);
});

test("Guelph pickup dataset contains no duplicate civic address inside the same pickup type", () => {
  const typedAddresses = allLocations.map(
    (location) =>
      `${location.pickupType}|${location.addressLine1}|${location.city}|${location.province}`.toLowerCase()
  );

  assert.equal(new Set(typedAddresses).size, typedAddresses.length);
});

test("Guelph pickup dataset includes the existing production Willow Road Quickie", () => {
  const willowQuickie = allLocations.find(
    (location) =>
      location.pickupType === "CONVENIENCE" &&
      location.addressLine1 === "61 Willow Road"
  );

  assert.ok(willowQuickie);
  assert.equal(willowQuickie.name, "Quickie Convenience - Willow Road");
  assert.equal(willowQuickie.postalCode, "N1H 1W3");
});
