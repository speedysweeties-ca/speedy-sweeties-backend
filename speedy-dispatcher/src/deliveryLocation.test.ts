import assert from "node:assert/strict";
import test from "node:test";
import {
  getVerifiedDeliveryPosition,
  needsDeliveryLocationReview,
  shouldUseLegacyBrowserGeocoding,
} from "./deliveryLocation.ts";

test("verified backend coordinates are used as the order marker position", () => {
  assert.deepEqual(
    getVerifiedDeliveryPosition({
      geocodeStatus: "VERIFIED",
      deliveryLatitude: 43.53,
      deliveryLongitude: -80.22,
    }),
    { lat: 43.53, lng: -80.22 }
  );
});

test("unverified coordinates are never accepted for a marker", () => {
  assert.equal(
    getVerifiedDeliveryPosition({
      geocodeStatus: "NEEDS_REVIEW",
      deliveryLatitude: 43.53,
      deliveryLongitude: -80.22,
    }),
    null
  );
});

test("browser geocoding is limited to an older backend that omits every field", () => {
  assert.equal(shouldUseLegacyBrowserGeocoding({}), true);
  assert.equal(shouldUseLegacyBrowserGeocoding({ geocodeStatus: null }), false);
});

test("historical null coordinates are shown as requiring review", () => {
  assert.equal(
    needsDeliveryLocationReview({
      geocodeStatus: null,
      deliveryLatitude: null,
      deliveryLongitude: null,
    }),
    true
  );
});
