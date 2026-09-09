const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildRoutablePickupLocationWhere
} = require("../dist/utils/pickupLocationAvailability.js");

test("routable pickup query excludes inactive and closed businesses", () => {
  assert.deepEqual(buildRoutablePickupLocationWhere(["LCBO", "VAPE"]), {
    isActive: true,
    pickupType: { in: ["LCBO", "VAPE"] },
    OR: [
      { googleBusinessStatus: null },
      { googleBusinessStatus: "OPERATIONAL" }
    ]
  });
});
