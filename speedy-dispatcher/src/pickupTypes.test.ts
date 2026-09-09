import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_PICKUP_TYPE_OPTIONS,
  PICKUP_LOCATION_TYPE_OPTIONS,
  isPickupLocationType,
} from "./pickupTypes.ts";

test("pickup locations allow only routable store categories", () => {
  assert.equal(isPickupLocationType("LCBO"), true);
  assert.equal(isPickupLocationType("UNKNOWN"), false);
  assert.equal(isPickupLocationType("NOT_REAL"), false);
  assert.equal(PICKUP_LOCATION_TYPE_OPTIONS.includes("LCBO"), true);
  assert.equal(CATALOG_PICKUP_TYPE_OPTIONS.includes("UNKNOWN"), true);
});
