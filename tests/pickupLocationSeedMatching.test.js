const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isSamePickupLocation
} = require("../dist/services/pickupLocationSeedMatching.service.js");

test("nearby competing stores are not treated as the same pickup location", () => {
  const existing = {
    name: "Value Buds - Gordon Street",
    addressLine1: "73 Gordon Street",
    latitude: 43.5425,
    longitude: -80.2475
  };

  const seed = {
    name: "FIKA Cannabis - Gordon Street",
    addressLine1: "89 Gordon Street Unit C3",
    latitude: 43.5428,
    longitude: -80.2473
  };

  assert.equal(isSamePickupLocation(existing, seed), false);
});

test("the same named store with a minor address-format change and nearby coordinates is matched", () => {
  const existing = {
    name: "LCBO - Scottsdale & Stone",
    addressLine1: "615 Scottsdale Dr",
    latitude: 43.518,
    longitude: -80.237
  };

  const seed = {
    name: "LCBO - Scottsdale & Stone",
    addressLine1: "615 Scottsdale Drive",
    latitude: 43.5181,
    longitude: -80.2371
  };

  assert.equal(isSamePickupLocation(existing, seed), true);
});

test("an exact civic address is matched even when the display name has changed", () => {
  const existing = {
    name: "Old Store Name",
    addressLine1: "128 Wyndham Street North",
    latitude: 43.547,
    longitude: -80.249
  };

  const seed = {
    name: "HighLife Cannabis - Wyndham Street North",
    addressLine1: "128 Wyndham Street North",
    latitude: 43.547,
    longitude: -80.249
  };

  assert.equal(isSamePickupLocation(existing, seed), true);
});
