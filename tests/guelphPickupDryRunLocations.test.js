const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GUELPH_PICKUP_DRY_RUN_LOCATIONS
} = require("../dist/data/guelphPickupDryRunLocations.js");

test("Guelph pickup source includes both requested 7-Eleven stores", () => {
  const sevenElevens = GUELPH_PICKUP_DRY_RUN_LOCATIONS.filter(
    (location) => location.name.startsWith("7-Eleven -")
  );

  assert.deepEqual(sevenElevens, [
    {
      name: "7-Eleven - Speedvale & Stevenson",
      pickupType: "CONVENIENCE",
      addressLine1: "328 Speedvale Avenue East",
      city: "Guelph",
      province: "ON",
      postalCode: "N1E 1N5"
    },
    {
      name: "7-Eleven - Victoria & Eramosa",
      pickupType: "CONVENIENCE",
      addressLine1: "585 Eramosa Road",
      city: "Guelph",
      province: "ON",
      postalCode: "N1E 2N4"
    }
  ]);
});
