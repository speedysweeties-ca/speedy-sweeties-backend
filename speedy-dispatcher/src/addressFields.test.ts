import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAddressRequestFields,
  parseGoogleAutocompleteAddress,
} from "./addressFields.ts";

const component = (
  longName: string,
  shortName: string,
  types: string[]
) => ({
  long_name: longName,
  short_name: shortName,
  types,
});

test("autocomplete provides the complete civic address used by order forms", () => {
  const address = parseGoogleAutocompleteAddress({
    address_components: [
      component("10A", "10A", ["street_number"]),
      component("Industrial Drive", "Industrial Dr", ["route"]),
      component("4", "4", ["subpremise"]),
      component("Guelph", "Guelph", ["locality"]),
      component("Ontario", "ON", ["administrative_area_level_1"]),
    ],
  });

  assert.deepEqual(address, {
    addressLine1: "10A Industrial Drive Unit 4",
    city: "Guelph",
    province: "ON",
  });
});

test("autocomplete rejects a selection missing required civic components", () => {
  const address = parseGoogleAutocompleteAddress({
    address_components: [
      component("10A", "10A", ["street_number"]),
      component("Industrial Drive", "Industrial Dr", ["route"]),
      component("Ontario", "ON", ["administrative_area_level_1"]),
    ],
  });

  assert.equal(address, null);
});

test("address request fields contain only the complete trimmed civic address", () => {
  const fields = buildAddressRequestFields({
    addressLine1: " 10A Industrial Drive Unit 4 ",
    city: " Guelph ",
    province: " ON ",
  });

  assert.deepEqual(fields, {
    addressLine1: "10A Industrial Drive Unit 4",
    city: "Guelph",
    province: "ON",
  });
  assert.deepEqual(Object.keys(fields).sort(), [
    "addressLine1",
    "city",
    "province",
  ]);
});
