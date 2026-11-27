import assert from "node:assert/strict";
import test from "node:test";
import { initialCustomerAddress, sameCustomerAddress } from "./customerAddressSelection.ts";

const oldAddress = { addressLine1: "10 First Synthetic Street", unitNumber: null, buzzCode: null, city: "Guelph", province: "ON", isDefault: true };
const latest = { ...oldAddress, addressLine1: "20 Second Synthetic Street", unitNumber: "4", buzzCode: "123" };

test("a recent profile address missing from the saved list takes priority over the old default", () => {
  const customer = { ...latest, savedAddresses: [oldAddress] };
  assert.equal(initialCustomerAddress(customer), customer);
  assert.equal(sameCustomerAddress(latest, oldAddress), false);
});

test("a saved default is honoured when the profile address is already in the list", () => {
  const defaultAddress = { ...latest, isDefault: true };
  const customer = { ...oldAddress, savedAddresses: [{ ...oldAddress, isDefault: false }, defaultAddress] };
  assert.equal(initialCustomerAddress(customer), defaultAddress);
});

test("matching ignores case and spacing but keeps apartment and buzz-code differences", () => {
  assert.equal(sameCustomerAddress(latest, { ...latest, addressLine1: " 20 SECOND   SYNTHETIC STREET " }), true);
  assert.equal(sameCustomerAddress(latest, { ...latest, province: "Ontario" }), true);
  assert.equal(sameCustomerAddress(latest, { ...latest, unitNumber: "5" }), false);
  assert.equal(sameCustomerAddress(latest, { ...latest, buzzCode: "456" }), false);
  assert.equal(sameCustomerAddress(oldAddress, { ...oldAddress, unitNumber: "", buzzCode: "" }), true);
});
