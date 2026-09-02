const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildCanonicalDeliveryAddress,
  createDeliveryAddressFingerprint,
  geocodeDeliveryAddress,
  hasCivicAddressChanged,
  sanitizeAddressLineForGeocoding,
  selectVerifiedGeocodeCandidate
} = require("../dist/services/deliveryGeocoding.service.js");

const address = {
  addressLine1: "10A Industrial Dr",
  city: "Guelph",
  province: "Ontario"
};

const result = (overrides = {}) => ({
  address_components: [
    { long_name: "10A", short_name: "10A", types: ["street_number"] },
    { long_name: "Industrial Drive", short_name: "Industrial Dr", types: ["route"] },
    { long_name: "Guelph", short_name: "Guelph", types: ["locality"] },
    { long_name: "Ontario", short_name: "ON", types: ["administrative_area_level_1"] },
    { long_name: "Canada", short_name: "CA", types: ["country"] },
    { long_name: "N1X 1X1", short_name: "N1X 1X1", types: ["postal_code"] }
  ],
  formatted_address: "10A Industrial Dr, Guelph, ON N1X 1X1, Canada",
  place_id: "verified-place",
  types: ["street_address"],
  geometry: {
    location: { lat: 43.53, lng: -80.22 },
    location_type: "ROOFTOP"
  },
  ...overrides
});

const response = (payload, ok = true) => ({
  ok,
  json: async () => payload
});

const serviceOptions = (payload) => ({
  apiKey: "test-key",
  fetchImplementation: async () => response(payload)
});

test("canonical address uses complete structured street fields without postal code", () => {
  assert.equal(
    buildCanonicalDeliveryAddress(address),
    "10A Industrial Dr, Guelph, ON, Canada"
  );
});

test("trailing delivery instructions are removed only from geocoding input", () => {
  assert.equal(
    sanitizeAddressLineForGeocoding("10A Industrial Dr side door"),
    "10A Industrial Dr"
  );
  assert.equal(address.addressLine1, "10A Industrial Dr");
});

test("instruction-only changes keep the same civic fingerprint", () => {
  const first = createDeliveryAddressFingerprint({
    ...address,
    addressLine1: "10A Industrial Dr side door"
  });
  const second = createDeliveryAddressFingerprint({
    ...address,
    addressLine1: "10A Industrial Dr back door"
  });
  assert.equal(first, second);
});

test("valid complete address without postalCode returns coordinates for order storage", async () => {
  const location = await geocodeDeliveryAddress(
    address,
    serviceOptions({ status: "OK", results: [result()] })
  );
  assert.equal(location.geocodeStatus, "VERIFIED");
  assert.equal(location.deliveryLatitude, 43.53);
  assert.equal(location.deliveryLongitude, -80.22);
  assert.equal(location.geocodePlaceId, "verified-place");
});

test("candidate selection evaluates all results rather than accepting the first", () => {
  const wrongFirst = result({ partial_match: true, place_id: "wrong" });
  const selected = selectVerifiedGeocodeCandidate(
    [wrongFirst, result()],
    address
  );
  assert.equal(selected?.place_id, "verified-place");
});

test("a supplied incorrect postalCode is ignored by geocoding", async () => {
  let requestedUrl = "";
  const location = await geocodeDeliveryAddress(
    { ...address, postalCode: "K1A 0A9" },
    {
      apiKey: "test-key",
      fetchImplementation: async (url) => {
        requestedUrl = String(url);
        return response({ status: "OK", results: [result()] });
      }
    }
  );

  assert.equal(location.geocodeStatus, "VERIFIED");
  assert.equal(location.deliveryLatitude, 43.53);
  assert.equal(location.deliveryLongitude, -80.22);
  assert.equal(
    new URL(requestedUrl).searchParams.get("address"),
    "10A Industrial Dr, Guelph, ON, Canada"
  );
  assert.equal(requestedUrl.includes("K1A"), false);
});

test("wrong municipality is rejected", async () => {
  const wrongCity = result({
    address_components: result().address_components.map((component) =>
      component.types.includes("locality")
        ? { ...component, long_name: "Toronto", short_name: "Toronto" }
        : component
    )
  });
  await assert.rejects(
    geocodeDeliveryAddress(
      address,
      serviceOptions({ status: "OK", results: [wrongCity] })
    ),
    /valid delivery address/
  );
});

test("wrong province or country is rejected", async () => {
  const wrongProvince = result({
    address_components: result().address_components.map((component) =>
      component.types.includes("administrative_area_level_1")
        ? { ...component, long_name: "Quebec", short_name: "QC" }
        : component
    )
  });
  await assert.rejects(
    geocodeDeliveryAddress(
      address,
      serviceOptions({ status: "OK", results: [wrongProvince] })
    )
  );
});

test("valid Ontario addresses are not rejected based on distance from Guelph", async () => {
  const ottawaAddress = {
    addressLine1: "111 Wellington St",
    city: "Ottawa",
    province: "Ontario"
  };
  const ottawaResult = result({
    address_components: result().address_components.map((component) => {
      if (component.types.includes("street_number")) {
        return { ...component, long_name: "111", short_name: "111" };
      }
      if (component.types.includes("route")) {
        return { ...component, long_name: "Wellington Street", short_name: "Wellington St" };
      }
      if (component.types.includes("locality")) {
        return { ...component, long_name: "Ottawa", short_name: "Ottawa" };
      }
      if (component.types.includes("postal_code")) {
        return { ...component, long_name: "K1A 0A9", short_name: "K1A 0A9" };
      }
      return component;
    }),
    geometry: {
      location: { lat: 45.4236, lng: -75.7009 },
      location_type: "ROOFTOP"
    },
    place_id: "ottawa-place"
  });

  const location = await geocodeDeliveryAddress(
    ottawaAddress,
    serviceOptions({ status: "OK", results: [ottawaResult] })
  );

  assert.equal(location.geocodeStatus, "VERIFIED");
  assert.equal(location.deliveryLatitude, 45.4236);
  assert.equal(location.deliveryLongitude, -75.7009);
});

test("low-confidence partial matches are rejected", async () => {
  await assert.rejects(
    geocodeDeliveryAddress(
      address,
      serviceOptions({ status: "OK", results: [result({ partial_match: true })] })
    )
  );
});

test("an incomplete street result without civic precision is rejected", async () => {
  const incompleteResult = result({
    address_components: result().address_components.filter(
      (component) => !component.types.includes("street_number")
    ),
    types: ["route"],
    geometry: {
      location: { lat: 43.53, lng: -80.22 },
      location_type: "GEOMETRIC_CENTER"
    }
  });

  await assert.rejects(
    geocodeDeliveryAddress(
      { ...address, addressLine1: "Industrial Dr" },
      serviceOptions({ status: "OK", results: [incompleteResult] })
    ),
    /valid delivery address/
  );
});

test("provider failure preserves an order-ready NEEDS_REVIEW result with null coordinates", async () => {
  const location = await geocodeDeliveryAddress(address, {
    apiKey: "test-key",
    fetchImplementation: async () => {
      throw new Error("temporary provider outage");
    }
  });
  assert.equal(location.geocodeStatus, "NEEDS_REVIEW");
  assert.equal(location.deliveryLatitude, null);
  assert.equal(location.deliveryLongitude, null);
});

test("missing server key is backward-compatible and does not guess coordinates", async () => {
  const location = await geocodeDeliveryAddress(address, { apiKey: "" });
  assert.equal(location.geocodeStatus, "NEEDS_REVIEW");
  assert.equal(location.deliveryLatitude, null);
});

test("a changed civic address produces a different fingerprint", () => {
  assert.notEqual(
    createDeliveryAddressFingerprint(address),
    createDeliveryAddressFingerprint({ ...address, addressLine1: "12 Industrial Dr" })
  );
});

test("a non-address edit does not invalidate the current coordinate fingerprint", () => {
  const currentFingerprint = createDeliveryAddressFingerprint(address);
  assert.equal(hasCivicAddressChanged(currentFingerprint, { ...address }), false);
});

test("a civic-address edit invalidates the previous coordinate fingerprint", () => {
  const currentFingerprint = createDeliveryAddressFingerprint(address);
  assert.equal(
    hasCivicAddressChanged(currentFingerprint, {
      ...address,
      addressLine1: "12 Industrial Dr"
    }),
    true
  );
});
