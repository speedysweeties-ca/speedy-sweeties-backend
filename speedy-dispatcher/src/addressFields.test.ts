import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAddressRequestFields,
  updateAddressFields,
  applyAutocompleteAddress,
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
    addressLine1: "10A Industrial Drive",
    unitNumber: "4",
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

test("delivery address requests keep unit and buzz details separate", () => {
  const fields = buildAddressRequestFields({
    addressLine1: " 10A Industrial Drive ",
    unitNumber: " 4B ",
    buzzCode: " 1234 ",
    city: " Guelph ",
    province: " ON ",
  });

  assert.deepEqual(fields, {
    addressLine1: "10A Industrial Drive",
    unitNumber: "4B",
    buzzCode: "1234",
    city: "Guelph",
    province: "ON",
  });
  assert.deepEqual(Object.keys(fields).sort(), [
    "addressLine1",
    "buzzCode",
    "city",
    "province",
    "unitNumber",
  ]);
});

test("blank access fields are sent as null so saved values can be cleared", () => {
  const fields = buildAddressRequestFields({
    addressLine1: "10A Industrial Drive",
    unitNumber: "   ",
    buzzCode: "",
    city: "Guelph",
    province: "ON",
  });

  assert.equal(fields.unitNumber, null);
  assert.equal(fields.buzzCode, null);
});

test("pickup civic-address requests do not gain delivery access fields", () => {
  const fields = buildAddressRequestFields({
    addressLine1: "1515 Gordon Street Unit 106",
    city: "Guelph",
    province: "ON",
  });

  assert.deepEqual(fields, {
    addressLine1: "1515 Gordon Street Unit 106",
    city: "Guelph",
    province: "ON",
  });
});

const oldAddress = { addressLine1: "10 Old Street", unitNumber: "4B", buzzCode: "1234", city: "Guelph", province: "Ontario" };
for (const patch of [{ addressLine1: "20 New Street" }, { city: "Cambridge" }, { province: "Quebec" }]) {
  test(`civic edit clears old access: ${Object.keys(patch)[0]}`, () => {
    const next = updateAddressFields(oldAddress, patch);
    assert.equal(next.unitNumber, "");
    assert.equal(next.buzzCode, "");
    assert.equal(buildAddressRequestFields(next).unitNumber, null);
    assert.equal(buildAddressRequestFields(next).buzzCode, null);
  });
}
test("formatting and access-only edits preserve the other access field", () => {
  assert.equal(updateAddressFields(oldAddress, { addressLine1: " 10  OLD Street ", province: "ON" }).buzzCode, "1234");
  assert.equal(updateAddressFields(oldAddress, { unitNumber: "" }).buzzCode, "1234");
});
test("saved address selection and subsequent access edits retain their own values", () => {
  const saved = { ...oldAddress, addressLine1: "20 New Street", unitNumber: "8", buzzCode: "888" };
  assert.deepEqual(updateAddressFields(oldAddress, saved), saved);
  const changed = updateAddressFields(oldAddress, { addressLine1: saved.addressLine1 });
  const entered = updateAddressFields(changed, { unitNumber: "8", buzzCode: "888" });
  assert.deepEqual(updateAddressFields(entered, { addressLine1: saved.addressLine1 }), saved);
});
test("autocomplete clears prior access on a new civic address and retains a supplied unit", () => {
  const selected = { addressLine1: "20 New Street", city: "Guelph", province: "ON", unitNumber: "9" };
  const changed = applyAutocompleteAddress(oldAddress, selected);
  assert.equal(changed.unitNumber, "9"); assert.equal(changed.buzzCode, "");
  const noUnit = applyAutocompleteAddress(oldAddress, { ...selected, unitNumber: "" });
  assert.equal(noUnit.unitNumber, ""); assert.equal(noUnit.buzzCode, "");
  assert.deepEqual(applyAutocompleteAddress(oldAddress, { ...oldAddress, unitNumber: "" }), oldAddress);
});
