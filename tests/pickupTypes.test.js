const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PICKUP_TYPE_OPTIONS,
  ROUTABLE_PICKUP_TYPE_OPTIONS,
  isRoutablePickupType,
  parsePickupType
} = require("../dist/constants/pickupTypes.js");

test("Brothers Brewing is a supported routable pickup type", () => {
  assert.equal(parsePickupType("brothers_brewing"), "BROTHERS_BREWING");
  assert.equal(isRoutablePickupType("BROTHERS_BREWING"), true);
  assert.equal(PICKUP_TYPE_OPTIONS.includes("BROTHERS_BREWING"), true);
  assert.equal(
    ROUTABLE_PICKUP_TYPE_OPTIONS.includes("BROTHERS_BREWING"),
    true
  );
});
