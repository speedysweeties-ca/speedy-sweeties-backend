const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CURRENT_HOURS_REFRESH_MS,
  REGULAR_HOURS_REFRESH_MS,
  isHoursRefreshDue,
  selectBestPlaceCandidate
} = require("../dist/services/pickupLocationHours.service.js");

const location = {
  name: "The Beer Store - Municipal",
  addressLine1: "710 Woolwich St",
  latitude: 43.5625,
  longitude: -80.2670
};

test("regular hours are due every 30 days", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");
  assert.equal(isHoursRefreshDue(null, REGULAR_HOURS_REFRESH_MS, now), true);
  assert.equal(
    isHoursRefreshDue(new Date("2026-08-10T12:00:00.000Z"), REGULAR_HOURS_REFRESH_MS, now),
    false
  );
  assert.equal(
    isHoursRefreshDue(new Date("2026-08-09T12:00:00.000Z"), REGULAR_HOURS_REFRESH_MS, now),
    true
  );
});

test("current hours are due every 7 days", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");
  assert.equal(
    isHoursRefreshDue(new Date("2026-09-02T12:00:00.000Z"), CURRENT_HOURS_REFRESH_MS, now),
    false
  );
  assert.equal(
    isHoursRefreshDue(new Date("2026-09-01T12:00:00.000Z"), CURRENT_HOURS_REFRESH_MS, now),
    true
  );
});

test("place matching prefers the nearby business with the matching name and address", () => {
  const match = selectBestPlaceCandidate(location, [
    {
      id: "wrong-business",
      displayName: { text: "Municipal Variety" },
      formattedAddress: "710 Woolwich St, Guelph, ON, Canada",
      location: { latitude: 43.56251, longitude: -80.26701 }
    },
    {
      id: "beer-store",
      displayName: { text: "The Beer Store" },
      formattedAddress: "710 Woolwich St, Guelph, ON, Canada",
      location: { latitude: 43.56254, longitude: -80.26705 }
    }
  ]);

  assert.equal(match?.id, "beer-store");
});

test("place matching rejects a candidate at a different civic number", () => {
  const match = selectBestPlaceCandidate(location, [
    {
      id: "wrong-address",
      displayName: { text: "The Beer Store" },
      formattedAddress: "800 Woolwich St, Guelph, ON, Canada",
      location: { latitude: 43.56252, longitude: -80.26702 }
    }
  ]);

  assert.equal(match, null);
});

test("place matching rejects an otherwise similar result that is too far away", () => {
  const match = selectBestPlaceCandidate(location, [
    {
      id: "far-away",
      displayName: { text: "The Beer Store" },
      formattedAddress: "710 Woolwich St, Guelph, ON, Canada",
      location: { latitude: 43.57, longitude: -80.27 }
    }
  ]);

  assert.equal(match, null);
});
