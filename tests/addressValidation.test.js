const assert = require("node:assert/strict");
const test = require("node:test");
const { assertValidatedCivicAddress, validateCivicAddress, AddressValidationUnavailableError } = require("../dist/services/addressValidation.service.js");
const address = { addressLine1: "1 Carden Street", city: "Guelph", province: "Ontario" };
const result = () => ({ verdict: { addressComplete: true, validationGranularity: "PREMISE" }, address: {
  postalAddress: { regionCode: "CA", administrativeArea: "ON", locality: "Guelph" },
  addressComponents: [
    { componentType: "street_number", componentName: { text: "1" }, confirmationLevel: "CONFIRMED" },
    { componentType: "route", componentName: { text: "Carden St" }, confirmationLevel: "CONFIRMED" }
  ]
} });
test("a confirmed premise with matching number and street passes without requiring postal input", () => {
  assert.doesNotThrow(() => assertValidatedCivicAddress(result(), address));
});
test("an inferred, replaced, or unconfirmed street number cannot pass as verified", () => {
  for (const properties of [{ inferred: true }, { replaced: true }, { confirmationLevel: "UNCONFIRMED_BUT_PLAUSIBLE" }]) {
    const data=result();Object.assign(data.address.addressComponents[0],properties);
    assert.throws(() => assertValidatedCivicAddress(data,address), /couldn't confirm/);
  }
});
test("a route-only result, mismatched number or wrong city is rejected", () => {
  const routeOnly=result();routeOnly.verdict.validationGranularity="ROUTE";
  const wrongNumber=result();wrongNumber.address.addressComponents[0].componentName.text="10";
  const wrongCity=result();wrongCity.address.postalAddress.locality="Toronto";
  for(const data of [routeOnly,wrongNumber,wrongCity]) assert.throws(()=>assertValidatedCivicAddress(data,address));
});
test("Google Address Validation receives only the civic address and never becomes a false success on errors", async () => {
  let body;
  await validateCivicAddress(address,{apiKey:"test-key",fetchImplementation:async(_url,init)=>{
    body=JSON.parse(init.body);return {ok:true,json:async()=>({result:result()})};
  }});
  assert.deepEqual(body,{address:{regionCode:"CA",administrativeArea:"ON",locality:"Guelph",addressLines:["1 Carden Street"]}});
  await assert.rejects(validateCivicAddress(address,{apiKey:""}),AddressValidationUnavailableError);
  await assert.rejects(validateCivicAddress(address,{apiKey:"test-key",fetchImplementation:async()=>{throw new Error("outage")}}),AddressValidationUnavailableError);
});
