import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateFallbackEta,
  haversineDistanceKm,
  selectPickupStopsForDriver,
  type RoutingPreviewPickupLocation,
} from "./routingPreviewMap.ts";

const driver = { latitude: 43.54, longitude: -80.25 };
const destination = { latitude: 43.52, longitude: -80.22 };

const locations: RoutingPreviewPickupLocation[] = [
  {
    id: "lcbo-near",
    name: "LCBO Near",
    pickupType: "LCBO",
    addressLine1: "1 Near Street",
    city: "Guelph",
    province: "ON",
    latitude: 43.535,
    longitude: -80.245,
  },
  {
    id: "lcbo-far",
    name: "LCBO Far",
    pickupType: "LCBO",
    addressLine1: "2 Far Street",
    city: "Guelph",
    province: "ON",
    latitude: 43.59,
    longitude: -80.31,
  },
  {
    id: "vape-near",
    name: "Vape Near",
    pickupType: "VAPE",
    addressLine1: "3 Vape Street",
    city: "Guelph",
    province: "ON",
    latitude: 43.53,
    longitude: -80.235,
  },
];

test("haversine distance returns zero for the same point", () => {
  assert.equal(haversineDistanceKm(driver, driver), 0);
});

test("routing preview selects one sensible candidate for each required pickup type", () => {
  const result = selectPickupStopsForDriver(
    driver,
    destination,
    ["LCBO", "VAPE"],
    locations
  );

  assert.equal(result.stops.length, 2);
  assert.equal(result.stops.some((location) => location.id === "lcbo-near"), true);
  assert.equal(result.stops.some((location) => location.id === "lcbo-far"), false);
  assert.equal(result.stops.some((location) => location.id === "vape-near"), true);
  assert.deepEqual(result.missingPickupTypes, []);
});

test("routing preview reports a pickup type with no active location", () => {
  const result = selectPickupStopsForDriver(
    driver,
    destination,
    ["BEER_STORE"],
    locations
  );

  assert.deepEqual(result.stops, []);
  assert.deepEqual(result.missingPickupTypes, ["BEER_STORE"]);
});

test("fallback ETA adds time when a pickup stop is required", () => {
  const direct = estimateFallbackEta(driver, destination, []);
  const withPickup = estimateFallbackEta(driver, destination, [locations[0]]);

  assert.equal(direct.etaMinutes > 0, true);
  assert.equal(withPickup.etaMinutes > direct.etaMinutes, true);
  assert.equal(withPickup.distanceKm > 0, true);
});
