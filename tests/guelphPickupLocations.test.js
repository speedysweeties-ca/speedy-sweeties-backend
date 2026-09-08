const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GUELPH_CORE_PICKUP_LOCATIONS
} = require("../dist/data/guelphPickupLocations.js");

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
      GUELPH_CORE_PICKUP_LOCATIONS.filter(
        (location) => location.pickupType === pickupType
      ).length
    ])
  );

  assert.equal(GUELPH_CORE_PICKUP_LOCATIONS.length, 39);
  assert.deepEqual(counts, {
    LCBO: 5,
    BEER_STORE: 4,
    VAPE: 7,
    DISPENSARY: 23,
    CONVENIENCE: 0
  });
});

test("Guelph pickup dataset uses only official non-UNKNOWN pickup types", () => {
  for (const location of GUELPH_CORE_PICKUP_LOCATIONS) {
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
  const names = GUELPH_CORE_PICKUP_LOCATIONS.map((location) =>
    location.name.toLowerCase()
  );

  assert.equal(new Set(names).size, names.length);
});

test("Guelph pickup dataset contains no duplicate civic address inside the same pickup type", () => {
  const typedAddresses = GUELPH_CORE_PICKUP_LOCATIONS.map(
    (location) =>
      `${location.pickupType}|${location.addressLine1}|${location.city}|${location.province}`.toLowerCase()
  );

  assert.equal(new Set(typedAddresses).size, typedAddresses.length);
});
