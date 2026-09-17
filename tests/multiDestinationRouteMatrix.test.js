const assert = require("node:assert/strict");
const test = require("node:test");

const {
  computeTrafficAwareRouteMatrixToDestinations
} = require("../dist/services/multiDestinationRouteMatrix.service.js");

const response = (payload) => ({
  ok: true,
  status: 200,
  json: async () => payload
});

test("multi-destination matrix defaults to traffic-aware routing", async () => {
  let requestedBody;

  await computeTrafficAwareRouteMatrixToDestinations(
    [{ id: "driver:a", latitude: 43.5, longitude: -80.25 }],
    [{ id: "store:a", latitude: 43.51, longitude: -80.24 }],
    {
      apiKey: "routes-test-key",
      fetchImplementation: async (_url, options) => {
        requestedBody = JSON.parse(options.body);
        return response([]);
      }
    }
  );

  assert.equal(requestedBody.routingPreference, "TRAFFIC_AWARE");
});

test("multi-destination matrix supports traffic-unaware interactive previews", async () => {
  let requestedBody;

  await computeTrafficAwareRouteMatrixToDestinations(
    [{ id: "driver:a", latitude: 43.5, longitude: -80.25 }],
    [{ id: "store:a", latitude: 43.51, longitude: -80.24 }],
    {
      apiKey: "routes-test-key",
      routingPreference: "TRAFFIC_UNAWARE",
      fetchImplementation: async (_url, options) => {
        requestedBody = JSON.parse(options.body);
        return response([]);
      }
    }
  );

  assert.equal(requestedBody.routingPreference, "TRAFFIC_UNAWARE");
});
