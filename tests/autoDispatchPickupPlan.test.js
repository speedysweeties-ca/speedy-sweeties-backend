const assert = require("node:assert/strict");
const test = require("node:test");

const {
  orderPickupRecommendations
} = require("../dist/services/autoDispatchPickupPlan.service.js");

const recommendation = (overrides = {}) => ({
  pickupType: "BEER_STORE",
  storeId: "store-a",
  storeName: "The Beer Store - Municipal Street",
  addressLine1: "710 Municipal Street",
  city: "Guelph",
  province: "ON",
  etaMinutes: 8,
  durationSeconds: 480,
  distanceMeters: 4200,
  projectedArrivalAt: "2026-09-09T00:08:00.000Z",
  hoursSource: "CURRENT",
  closingDate: "2026-09-08",
  closingTime: "20:00",
  closingBufferMinutes: 3,
  ...overrides
});

test("an incomplete recommendation set cannot become an auto-dispatch pickup plan", () => {
  const result = orderPickupRecommendations([
    recommendation(),
    { pickupType: "LCBO", unavailable: true }
  ]);

  assert.equal(result, null);
});

test("persisted pickup stops are sequenced by driver-to-store ETA", () => {
  const result = orderPickupRecommendations([
    recommendation({
      pickupType: "LCBO",
      storeId: "lcbo-a",
      storeName: "LCBO - Scottsdale Drive",
      durationSeconds: 720,
      etaMinutes: 12
    }),
    recommendation({
      pickupType: "BEER_STORE",
      storeId: "beer-a",
      storeName: "The Beer Store - Municipal Street",
      durationSeconds: 300,
      etaMinutes: 5
    })
  ]);

  assert.ok(result);
  assert.equal(result.length, 2);
  assert.equal(result[0].pickupType, "BEER_STORE");
  assert.equal(result[0].sequence, 1);
  assert.equal(result[1].pickupType, "LCBO");
  assert.equal(result[1].sequence, 2);
});

test("persisted pickup stops preserve the three-minute closing safety data", () => {
  const result = orderPickupRecommendations([recommendation()]);

  assert.ok(result);
  assert.equal(result[0].closingBufferMinutes, 3);
  assert.equal(result[0].closingTime, "20:00");
  assert.equal(result[0].hoursSource, "CURRENT");
  assert.equal(result[0].storeName, "The Beer Store - Municipal Street");
});
