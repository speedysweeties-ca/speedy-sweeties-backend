const assert = require("node:assert/strict");
const test = require("node:test");

const {
  computeTrafficAwareRouteMatrix,
  parseGoogleDurationSeconds
} = require("../dist/services/routingPreview.service.js");

const origins = [
  { driverId: "driver-a", latitude: 43.535, longitude: -80.245 },
  { driverId: "driver-b", latitude: 43.55, longitude: -80.22 }
];

const destination = {
  latitude: 43.525,
  longitude: -80.25
};

const response = (payload, options = {}) => ({
  ok: options.ok ?? true,
  status: options.status ?? 200,
  json: async () => payload
});

test("Google duration strings are converted to seconds", () => {
  assert.equal(parseGoogleDurationSeconds("420s"), 420);
  assert.equal(parseGoogleDurationSeconds("3.5s"), 3.5);
  assert.equal(parseGoogleDurationSeconds("bad"), null);
  assert.equal(parseGoogleDurationSeconds(null), null);
});

test("route matrix sends one traffic-aware batch for all drivers", async () => {
  let requestedUrl = "";
  let requestedOptions;

  const results = await computeTrafficAwareRouteMatrix(origins, destination, {
    apiKey: "routes-test-key",
    fetchImplementation: async (url, options) => {
      requestedUrl = String(url);
      requestedOptions = options;
      return response([
        {
          originIndex: 0,
          destinationIndex: 0,
          status: {},
          condition: "ROUTE_EXISTS",
          distanceMeters: 4100,
          duration: "480s"
        },
        {
          originIndex: 1,
          destinationIndex: 0,
          status: {},
          condition: "ROUTE_EXISTS",
          distanceMeters: 6200,
          duration: "660s"
        }
      ]);
    }
  });

  assert.equal(
    requestedUrl,
    "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
  );
  assert.equal(requestedOptions.method, "POST");
  assert.equal(requestedOptions.headers["X-Goog-Api-Key"], "routes-test-key");
  assert.equal(
    requestedOptions.headers["X-Goog-FieldMask"],
    "originIndex,destinationIndex,status,condition,distanceMeters,duration"
  );

  const body = JSON.parse(requestedOptions.body);
  assert.equal(body.travelMode, "DRIVE");
  assert.equal(body.routingPreference, "TRAFFIC_AWARE");
  assert.equal(body.origins.length, 2);
  assert.equal(body.destinations.length, 1);

  assert.deepEqual(results, [
    {
      driverId: "driver-a",
      durationSeconds: 480,
      distanceMeters: 4100,
      routeAvailable: true
    },
    {
      driverId: "driver-b",
      durationSeconds: 660,
      distanceMeters: 6200,
      routeAvailable: true
    }
  ]);
});

test("origin indexes keep route results attached to the correct driver", async () => {
  const results = await computeTrafficAwareRouteMatrix(origins, destination, {
    apiKey: "routes-test-key",
    fetchImplementation: async () =>
      response([
        {
          originIndex: 1,
          destinationIndex: 0,
          status: {},
          condition: "ROUTE_EXISTS",
          distanceMeters: 7000,
          duration: "900s"
        },
        {
          originIndex: 0,
          destinationIndex: 0,
          status: {},
          condition: "ROUTE_EXISTS",
          distanceMeters: 3000,
          duration: "360s"
        }
      ])
  });

  assert.equal(results[0].driverId, "driver-a");
  assert.equal(results[0].durationSeconds, 360);
  assert.equal(results[1].driverId, "driver-b");
  assert.equal(results[1].durationSeconds, 900);
});

test("a missing route remains visible as unavailable rather than being guessed", async () => {
  const results = await computeTrafficAwareRouteMatrix(origins, destination, {
    apiKey: "routes-test-key",
    fetchImplementation: async () =>
      response([
        {
          originIndex: 0,
          destinationIndex: 0,
          status: {},
          condition: "ROUTE_EXISTS",
          distanceMeters: 3000,
          duration: "360s"
        },
        {
          originIndex: 1,
          destinationIndex: 0,
          status: {},
          condition: "ROUTE_NOT_FOUND"
        }
      ])
  });

  assert.equal(results[0].routeAvailable, true);
  assert.equal(results[1].routeAvailable, false);
  assert.equal(results[1].durationSeconds, null);
  assert.equal(results[1].distanceMeters, null);
});

test("missing Routes API configuration fails closed", async () => {
  await assert.rejects(
    computeTrafficAwareRouteMatrix(origins, destination, { apiKey: "" }),
    /not configured/i
  );
});

test("provider failures return a routing-preview error instead of a fake ETA", async () => {
  await assert.rejects(
    computeTrafficAwareRouteMatrix(origins, destination, {
      apiKey: "routes-test-key",
      fetchImplementation: async () => response({}, { ok: false, status: 503 })
    }),
    /HTTP 503/
  );
});
