const assert = require("node:assert/strict");
const test = require("node:test");

const {
  computeConfiguredRouteMatrixToDestinations
} = require("../dist/services/trafficRouting.service.js");

const origins = [
  { id: "driver-near", latitude: 43.54, longitude: -80.25 },
  { id: "driver-far", latitude: 43.48, longitude: -80.25 }
];
const destinations = [
  { id: "customer", latitude: 43.55, longitude: -80.25 }
];

test("traffic off uses free coordinate estimates without calling Google", async () => {
  let fetchCalls = 0;

  const result = await computeConfiguredRouteMatrixToDestinations(
    origins,
    destinations,
    {
      liveTrafficEnabled: false,
      googleOptions: {
        apiKey: "must-not-be-used",
        fetchImplementation: async () => {
          fetchCalls += 1;
          throw new Error("Google should not be called while traffic is off");
        }
      }
    }
  );

  assert.equal(result.mode, "FREE_COORDINATE_ESTIMATE");
  assert.equal(fetchCalls, 0);
  assert.equal(result.matrix.length, 2);
  assert.equal(result.matrix.every((route) => route.routeAvailable), true);
  assert.equal(
    result.matrix[0].distanceMeters < result.matrix[1].distanceMeters,
    true
  );
});

test("traffic on calls Google with TRAFFIC_AWARE routing", async () => {
  let requestedBody;

  const result = await computeConfiguredRouteMatrixToDestinations(
    [origins[0]],
    destinations,
    {
      liveTrafficEnabled: true,
      googleOptions: {
        apiKey: "routes-test-key",
        fetchImplementation: async (_url, options) => {
          requestedBody = JSON.parse(options.body);
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                originIndex: 0,
                destinationIndex: 0,
                status: {},
                condition: "ROUTE_EXISTS",
                distanceMeters: 1500,
                duration: "240s"
              }
            ]
          };
        }
      }
    }
  );

  assert.equal(result.mode, "GOOGLE_LIVE_TRAFFIC");
  assert.equal(requestedBody.routingPreference, "TRAFFIC_AWARE");
  assert.equal(result.matrix[0].durationSeconds, 240);
});
