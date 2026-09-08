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

test("Guelph anchor pickup dataset contains five LCBOs and four Beer Stores", () => {
  assert.equal(GUELPH_CORE_PICKUP_LOCATIONS.length, 9);

  const lcboCount = GUELPH_CORE_PICKUP_LOCATIONS.filter(
    (location) => location.pickupType === "LCBO"
  ).length;
  const beerStoreCount = GUELPH_CORE_PICKUP_LOCATIONS.filter(
    (location) => location.pickupType === "BEER_STORE"
  ).length;

  assert.equal(lcboCount, 5);
  assert.equal(beerStoreCount, 4);
});

test("Guelph anchor pickup dataset uses only official non-UNKNOWN pickup types", () => {
  for (const location of GUELPH_CORE_PICKUP_LOCATIONS) {
    assert.equal(officialPickupTypes.has(location.pickupType), true);
    assert.notEqual(location.pickupType, "UNKNOWN");
    assert.equal(location.city, "Guelph");
    assert.equal(location.province, "ON");
    assert.match(location.postalCode, /^[A-Z]\d[A-Z] \d[A-Z]\d$/);
  }
});

test("Guelph anchor pickup dataset contains no duplicate names or civic addresses", () => {
  const names = GUELPH_CORE_PICKUP_LOCATIONS.map((location) => location.name);
  const addresses = GUELPH_CORE_PICKUP_LOCATIONS.map(
    (location) =>
      `${location.addressLine1}|${location.city}|${location.province}`.toLowerCase()
  );

  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(addresses).size, addresses.length);
});
