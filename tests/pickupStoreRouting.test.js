const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PICKUP_STORE_CLOSING_BUFFER_MINUTES,
  evaluatePickupStoreEligibility,
  selectPickupStoreRecommendations
} = require("../dist/services/pickupStoreRouting.service.js");

const baseStore = (overrides = {}) => ({
  id: "store-a",
  name: "The Beer Store - Municipal Street",
  pickupType: "BEER_STORE",
  addressLine1: "710 Municipal Street",
  city: "Guelph",
  province: "ON",
  latitude: 43.52,
  longitude: -80.26,
  googleBusinessStatus: "OPERATIONAL",
  regularOpeningHours: {
    periods: [
      {
        open: { day: 2, hour: 10, minute: 0 },
        close: { day: 2, hour: 20, minute: 0 }
      }
    ]
  },
  currentOpeningHours: null,
  manualHoursOverride: null,
  ...overrides
});

// September 8, 2026 is a Tuesday. Guelph is UTC-4 on this date.
const torontoTime = (hour, minute) =>
  new Date(Date.UTC(2026, 8, 8, hour + 4, minute));

test("pickup-store closing safety buffer is exactly three minutes", () => {
  assert.equal(PICKUP_STORE_CLOSING_BUFFER_MINUTES, 3);
});

test("arrival exactly three minutes before closing is eligible", () => {
  const result = evaluatePickupStoreEligibility(
    baseStore(),
    torontoTime(19, 57)
  );

  assert.equal(result.eligible, true);
  assert.equal(result.reason, "ELIGIBLE");
  assert.equal(result.closingTime, "20:00");
  assert.equal(result.closingBufferMinutes, 3);
});

test("arrival less than three minutes before closing is excluded", () => {
  const result = evaluatePickupStoreEligibility(
    baseStore(),
    torontoTime(19, 58)
  );

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "CLOSES_WITHIN_BUFFER");
});

test("current or holiday hours override regular monthly hours", () => {
  const result = evaluatePickupStoreEligibility(
    baseStore({
      currentOpeningHours: {
        periods: [
          {
            open: { day: 2, hour: 10, minute: 0 },
            close: { day: 2, hour: 18, minute: 0 }
          }
        ]
      }
    }),
    torontoTime(18, 5)
  );

  assert.equal(result.eligible, false);
  assert.equal(result.hoursSource, "CURRENT");
  assert.equal(result.reason, "NOT_OPEN_AT_ARRIVAL");
});

test("manual dated override has highest priority", () => {
  const result = evaluatePickupStoreEligibility(
    baseStore({
      currentOpeningHours: {
        periods: [
          {
            open: { day: 2, hour: 10, minute: 0 },
            close: { day: 2, hour: 22, minute: 0 }
          }
        ]
      },
      manualHoursOverride: [
        {
          date: "2026-09-08",
          isClosed: true
        }
      ]
    }),
    torontoTime(14, 0)
  );

  assert.equal(result.eligible, false);
  assert.equal(result.hoursSource, "MANUAL");
  assert.equal(result.reason, "MANUAL_CLOSED");
});

test("stores without trustworthy hours fail closed", () => {
  const result = evaluatePickupStoreEligibility(
    baseStore({ regularOpeningHours: null, currentOpeningHours: null }),
    torontoTime(14, 0)
  );

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "HOURS_UNAVAILABLE");
});

test("permanently closed stores are never eligible", () => {
  const result = evaluatePickupStoreEligibility(
    baseStore({ googleBusinessStatus: "CLOSED_PERMANENTLY" }),
    torontoTime(14, 0)
  );

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "BUSINESS_NOT_OPERATIONAL");
});

test("selector skips a nearer store that would close inside the buffer", () => {
  const nearStore = baseStore({ id: "near", name: "Near Beer Store" });
  const fartherStore = baseStore({
    id: "far",
    name: "Farther Beer Store",
    regularOpeningHours: {
      periods: [
        {
          open: { day: 2, hour: 10, minute: 0 },
          close: { day: 2, hour: 21, minute: 0 }
        }
      ]
    }
  });

  const recommendations = selectPickupStoreRecommendations({
    driverId: "driver-a",
    requiredPickupTypes: ["BEER_STORE"],
    stores: [nearStore, fartherStore],
    generatedAt: torontoTime(19, 53),
    matrix: [
      {
        originId: "driver-a",
        destinationId: "near",
        durationSeconds: 5 * 60,
        distanceMeters: 2500,
        routeAvailable: true
      },
      {
        originId: "driver-a",
        destinationId: "far",
        durationSeconds: 8 * 60,
        distanceMeters: 4100,
        routeAvailable: true
      }
    ]
  });

  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0].storeId, "far");
  assert.equal(recommendations[0].closingBufferMinutes, 3);
});
