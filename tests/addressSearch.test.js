const assert = require("node:assert/strict");
const test = require("node:test");
const { searchAddresses, getAddressDetails, parsePlaceAddress, AddressSearchUnavailableError } = require("../dist/services/addressSearch.service.js");
const components = [
  { longText: "10", shortText: "10", types: ["street_number"] },
  { longText: "Example Street", shortText: "Example St", types: ["route"] },
  { longText: "Guelph", shortText: "Guelph", types: ["locality"] },
  { longText: "Ontario", shortText: "ON", types: ["administrative_area_level_1"] },
  { longText: "Canada", shortText: "CA", types: ["country"] },
  { longText: "4B", shortText: "4B", types: ["subpremise"] }
];
test("Google place selection keeps unit separate and requires a civic street number", () => {
  assert.deepEqual(parsePlaceAddress(components), { addressLine1: "10 Example Street", city: "Guelph", province: "Ontario", unitNumber: "4B" });
  assert.throws(() => parsePlaceAddress(components.filter(c => !c.types.includes("street_number"))), /complete Ontario street address/);
});
test("Google place selection rejects a different country or province", () => {
  assert.throws(() => parsePlaceAddress(components.map(c => c.types.includes("country") ? { ...c, shortText: "US" } : c)));
  assert.throws(() => parsePlaceAddress(components.map(c => c.types.includes("administrative_area_level_1") ? { ...c, shortText: "QC" } : c)));
});
test("autocomplete limits results and uses server key, country restriction, and session token", async () => {
  let request;
  const suggestions = await searchAddresses("10 Example", "test-session-token", { apiKey: "test-secret", fetchImplementation: async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({ suggestions: [{ placePrediction: { placeId: "place-1", text: { text: "10 Example Street" } } }] }) };
  }});
  const body = JSON.parse(request.init.body);
  assert.deepEqual(body.includedRegionCodes, ["ca"]);
  assert.equal(body.sessionToken, "test-session-token");
  assert.equal(request.init.headers["X-Goog-Api-Key"], "test-secret");
  assert.deepEqual(suggestions, [{ placeId: "place-1", description: "10 Example Street" }]);
  assert.equal(JSON.stringify(suggestions).includes("test-secret"), false);
});
test("place details finishes the same Google session and returns structured fields", async () => {
  let requested;
  const address = await getAddressDetails("place-1", "test-session-token", { apiKey: "test-key", fetchImplementation: async (url) => {
    requested = new URL(url);
    return { ok: true, json: async () => ({ addressComponents: components }) };
  }});
  assert.equal(requested.searchParams.get("sessionToken"), "test-session-token");
  assert.equal(address.addressLine1, "10 Example Street");
});
test("provider errors fail clearly without returning guessed addresses", async () => {
  await assert.rejects(searchAddresses("10 Example", "test-session-token", { apiKey: "test-key", fetchImplementation: async () => ({ ok: false }) }), AddressSearchUnavailableError);
});

test("public verification rejects invalid inputs and provider outages; script can load on Webflow", async t => {
  const app = require("../dist/app.js").default;
  const geo = require("../dist/services/deliveryGeocoding.service.js");
  const original = geo.geocodeDeliveryAddress;
  t.after(() => { geo.geocodeDeliveryAddress = original; });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = body => fetch(base + "/api/v1/addresses/verify", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  assert.equal((await post({ addressLine1: "X" })).status, 400);
  const body = { addressLine1: "1 Carden Street", city: "Guelph", province: "Ontario" };
  geo.geocodeDeliveryAddress = async (_address, options) => { assert.equal(options.requireRooftop, true); return { geocodeStatus: "NEEDS_REVIEW" }; };
  const outage = await post(body);
  assert.equal(outage.status, 503);
  assert.equal((await outage.json()).code, "ADDRESS_CHECK_UNAVAILABLE");
  geo.geocodeDeliveryAddress = async () => { throw new geo.DeliveryAddressValidationError("Invalid"); };
  const invalid = await post(body);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, "INVALID_DELIVERY_ADDRESS");
  geo.geocodeDeliveryAddress = async () => ({ geocodeStatus: "VERIFIED" });
  const valid = await post(body);
  assert.deepEqual(await valid.json(), { success: true, verified: true });
  assert.equal(valid.headers.get("cache-control"), "no-store");
  const asset = await fetch(base + "/webflow/address-autocomplete.js");
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("cross-origin-resource-policy"), "cross-origin");
});
