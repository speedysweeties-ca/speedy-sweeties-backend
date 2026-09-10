const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PICKUP_STORE_CLOSING_BUFFER_MINUTES,
  MAX_PRIMARY_PICKUP_STORE_CANDIDATES_PER_TYPE,
  MAX_SEQUENTIAL_PICKUP_ROUTE_COMPLETION_EVALUATIONS,
  PREFERRED_PICKUP_ROUTE_MAX_EXTRA_SECONDS,
  evaluatePickupStoreEligibility,
  pickupStoreRouteNodeId,
  selectSequentialPickupRoutePlan,
  selectPickupStoreRecommendations
} = require("../dist/services/pickupStoreRouting.service.js");

const baseStore = (overrides = {}) => ({
  id: "store-a",
  name: "The Beer Store - Municipal Street",
  pickupType: "BEER_STORE",
  addressLine1: "710 Municipal Street",
  city: "Guelph",
  province: "ON",
  latitude: 43.52,
  longitude: -80.26,
  googleBusinessStatus: "OPERATIONAL",
  regularOpeningHours: {
    periods: [
      {
        open: { day: 2, hour: 10, minute: 0 },
        close: { day: 2, hour: 20, minute: 0 }
      }
    ]
  },
  currentOpeningHours: null,
  manualHoursOverride: null,
  ...overrides
});

// September 8, 2026 is a Tuesday. Guelph is UTC-4 on this date.
const torontoTime = (hour, minute) =>
  new Date(Date.UTC(2026, 8, 8, hour + 4, minute));

const route = (originId, destinationId, durationSeconds, distanceMeters = 1000) => ({
  originId,
  destinationId,
  durationSeconds,
  distanceMeters,
  routeAvailable: true
});

const sequentialPlan = (stores, matrix, requiredPickupTypes, generatedAt = torontoTime(12, 0), onSearchDiagnostics) =>
  selectSequentialPickupRoutePlan({
    driverRouteNodeId: "driver:driver-a",
    customerRouteNodeId: "customer:order-a",
    requiredPickupTypes,
    stores,
    matrix,
    generatedAt,
    onSearchDiagnostics
  });

test("pickup-store closing safety buffer is exactly three minutes", () => {
  assert.equal(PICKUP_STORE_CLOSING_BUFFER_MINUTES, 3);
});

test("preferred pickup routes are selected only within the centralized allowance", () => {
  const standard = baseStore({ id: "standard", name: "Standard Store" });
  const preferred = baseStore({
    id: "preferred",
    name: "Preferred Store",
    routingPriority: "PREFERRED"
  });
  const withinAllowance = sequentialPlan(
    [standard, preferred],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("standard"), 100),
      route("driver:driver-a", pickupStoreRouteNodeId("preferred"), 100),
      route(pickupStoreRouteNodeId("standard"), "customer:order-a", 100),
      route(pickupStoreRouteNodeId("preferred"), "customer:order-a", 279)
    ],
    ["BEER_STORE"]
  );
  const overAllowance = sequentialPlan(
    [standard, preferred],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("standard"), 100),
      route("driver:driver-a", pickupStoreRouteNodeId("preferred"), 100),
      route(pickupStoreRouteNodeId("standard"), "customer:order-a", 100),
      route(pickupStoreRouteNodeId("preferred"), "customer:order-a", 281)
    ],
    ["BEER_STORE"]
  );

  assert.equal(PREFERRED_PICKUP_ROUTE_MAX_EXTRA_SECONDS, 180);
  assert.equal(withinAllowance.pickupStops[0].storeId, "preferred");
  assert.equal(overAllowance.pickupStops[0].storeId, "standard");
});

test("a preferred store outside the four closest driver legs remains protected by its priority shortlist", () => {
  const standards = [10, 20, 30, 40, 50].map((duration, index) =>
    baseStore({ id: `standard-${index}`, name: `Standard ${index}` })
  );
  const preferred = baseStore({
    id: "preferred-outside-four",
    routingPriority: "PREFERRED"
  });
  let diagnostics;
  const plan = sequentialPlan(
    [...standards, preferred],
    [
      ...standards.flatMap((store, index) => [
        route("driver:driver-a", pickupStoreRouteNodeId(store.id), (index + 1) * 10),
        route(pickupStoreRouteNodeId(store.id), "customer:order-a", index === 0 ? 90 : 1_000)
      ]),
      route("driver:driver-a", pickupStoreRouteNodeId(preferred.id), 100),
      route(pickupStoreRouteNodeId(preferred.id), "customer:order-a", 179)
    ],
    ["BEER_STORE"],
    torontoTime(12, 0),
    (result) => {
      diagnostics = result;
    }
  );

  assert.equal(plan.pickupStops[0].storeId, preferred.id);
  assert.equal(diagnostics.primaryCandidateCountsByPickupType.BEER_STORE, 3);
});

test("standard candidates cannot crowd protected preferred shortlist capacity", () => {
  const standards = Array.from({ length: 20 }, (_, index) =>
    baseStore({ id: `standard-${index}` })
  );
  const preferred = Array.from({ length: 4 }, (_, index) =>
    baseStore({ id: `preferred-${index}`, routingPriority: "PREFERRED" })
  );
  let diagnostics;
  const stores = [...standards, ...preferred];
  const matrix = stores.flatMap((store, index) => [
    route("driver:driver-a", pickupStoreRouteNodeId(store.id), index + 1),
    route(pickupStoreRouteNodeId(store.id), "customer:order-a", 100)
  ]);
  const plan = sequentialPlan(
    stores,
    matrix,
    ["BEER_STORE"],
    torontoTime(12, 0),
    (result) => {
      diagnostics = result;
    }
  );

  assert.equal(
    diagnostics.primaryCandidateCountsByPickupType.BEER_STORE,
    MAX_PRIMARY_PICKUP_STORE_CANDIDATES_PER_TYPE
  );
  assert.equal(plan.pickupStops[0].storeId, "preferred-0");
});

test("the fastest route wins between qualifying preferred routes", () => {
  const standard = baseStore({ id: "standard" });
  const preferredSlow = baseStore({ id: "preferred-slow", routingPriority: "PREFERRED" });
  const preferredFast = baseStore({ id: "preferred-fast", routingPriority: "PREFERRED" });
  const plan = sequentialPlan(
    [standard, preferredSlow, preferredFast],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("standard"), 100),
      route("driver:driver-a", pickupStoreRouteNodeId("preferred-slow"), 100),
      route("driver:driver-a", pickupStoreRouteNodeId("preferred-fast"), 100),
      route(pickupStoreRouteNodeId("standard"), "customer:order-a", 100),
      route(pickupStoreRouteNodeId("preferred-slow"), "customer:order-a", 250),
      route(pickupStoreRouteNodeId("preferred-fast"), "customer:order-a", 200)
    ],
    ["BEER_STORE"]
  );

  assert.equal(plan.pickupStops[0].storeId, "preferred-fast");
});

test("ineligible preferred stores cannot override a valid standard route", () => {
  const standard = baseStore({ id: "standard" });
  const closedPreferred = baseStore({
    id: "closed",
    routingPriority: "PREFERRED",
    googleBusinessStatus: "CLOSED_PERMANENTLY"
  });
  const inactivePreferred = baseStore({
    id: "inactive",
    routingPriority: "PREFERRED",
    isActive: false
  });
  const invalidPreferred = baseStore({
    id: "invalid",
    routingPriority: "PREFERRED",
    latitude: 999
  });
  const incompatiblePreferred = baseStore({
    id: "incompatible",
    pickupType: "LCBO",
    routingPriority: "PREFERRED"
  });
  const plan = sequentialPlan(
    [standard, closedPreferred, inactivePreferred, invalidPreferred, incompatiblePreferred],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("standard"), 100),
      route(pickupStoreRouteNodeId("standard"), "customer:order-a", 100),
      route("driver:driver-a", pickupStoreRouteNodeId("closed"), 1),
      route(pickupStoreRouteNodeId("closed"), "customer:order-a", 1),
      route("driver:driver-a", pickupStoreRouteNodeId("inactive"), 1),
      route(pickupStoreRouteNodeId("inactive"), "customer:order-a", 1),
      route("driver:driver-a", pickupStoreRouteNodeId("invalid"), 1),
      route(pickupStoreRouteNodeId("invalid"), "customer:order-a", 1)
    ],
    ["BEER_STORE"]
  );

  assert.equal(plan.pickupStops[0].storeId, "standard");
});

test("standard-only routing preserves the fastest complete route", () => {
  const first = baseStore({ id: "first" });
  const second = baseStore({ id: "second" });
  const plan = sequentialPlan(
    [first, second],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("first"), 20),
      route("driver:driver-a", pickupStoreRouteNodeId("second"), 100),
      route(pickupStoreRouteNodeId("first"), "customer:order-a", 500),
      route(pickupStoreRouteNodeId("second"), "customer:order-a", 100)
    ],
    ["BEER_STORE"]
  );

  assert.equal(plan.pickupStops[0].storeId, "second");
  assert.equal(plan.totalDurationSeconds, 200);
});

test("fallback stores are used only when no complete preferred-or-standard route exists", () => {
  const standard = baseStore({ id: "standard" });
  const fallback = baseStore({ id: "fallback", routingPriority: "FALLBACK" });
  const standardPlan = sequentialPlan(
    [standard, fallback],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("standard"), 200),
      route(pickupStoreRouteNodeId("standard"), "customer:order-a", 200),
      route("driver:driver-a", pickupStoreRouteNodeId("fallback"), 10),
      route(pickupStoreRouteNodeId("fallback"), "customer:order-a", 10)
    ],
    ["BEER_STORE"]
  );
  const fallbackOnlyPlan = sequentialPlan(
    [fallback],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("fallback"), 10),
      route(pickupStoreRouteNodeId("fallback"), "customer:order-a", 10)
    ],
    ["BEER_STORE"]
  );

  assert.equal(standardPlan.pickupStops[0].storeId, "standard");
  assert.equal(fallbackOnlyPlan.pickupStops[0].storeId, "fallback");
});

test("fallback candidates are not searched when a complete non-fallback route exists", () => {
  const standard = baseStore({ id: "standard" });
  const fallback = baseStore({ id: "fallback", routingPriority: "FALLBACK" });
  let diagnostics;
  const plan = sequentialPlan(
    [standard, fallback],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("standard"), 100),
      route(pickupStoreRouteNodeId("standard"), "customer:order-a", 100),
      route("driver:driver-a", pickupStoreRouteNodeId("fallback"), 1),
      route(pickupStoreRouteNodeId("fallback"), "customer:order-a", 1)
    ],
    ["BEER_STORE"],
    torontoTime(12, 0),
    (result) => {
      diagnostics = result;
    }
  );

  assert.equal(plan.pickupStops[0].storeId, "standard");
  assert.equal(diagnostics.fallbackCandidateCountsByPickupType, null);
});

const largeBoundedRoutingFixture = () => {
  const pickupTypes = ["BEER_STORE", "LCBO", "CANNABIS", "CONVENIENCE"];
  const priorities = ["PREFERRED", "STANDARD", "FALLBACK"];
  const stores = [];
  const matrix = [];
  const primaryStores = [];

  pickupTypes.forEach((pickupType, pickupTypeIndex) => {
    priorities.forEach((routingPriority) => {
      Array.from({ length: 12 }, (_, index) => {
        const store = baseStore({
          id: `${pickupType}-${routingPriority}-${index}`,
          name: `${pickupType}-${routingPriority}-${index}`,
          pickupType,
          routingPriority
        });
        stores.push(store);
        matrix.push(
          route("driver:driver-a", pickupStoreRouteNodeId(store.id), index + 1),
          route(pickupStoreRouteNodeId(store.id), "customer:order-a", 100)
        );
        if (routingPriority !== "FALLBACK" && index < 2) {
          primaryStores.push(store);
        }
      });
    });
  });

  primaryStores.forEach((origin) => {
    primaryStores.forEach((destination) => {
      if (origin.pickupType !== destination.pickupType) {
        matrix.push(
          route(pickupStoreRouteNodeId(origin.id), pickupStoreRouteNodeId(destination.id), 10)
        );
      }
    });
  });

  return { pickupTypes, stores, matrix };
};

test("large four-type routing stays within declared candidate and streaming workload bounds", () => {
  const { pickupTypes, stores, matrix } = largeBoundedRoutingFixture();
  let diagnostics;
  const plan = sequentialPlan(
    stores,
    matrix,
    pickupTypes,
    torontoTime(12, 0),
    (result) => {
      diagnostics = result;
    }
  );

  assert.ok(plan);
  assert.deepEqual(
    Object.values(diagnostics.primaryCandidateCountsByPickupType),
    [
      MAX_PRIMARY_PICKUP_STORE_CANDIDATES_PER_TYPE,
      MAX_PRIMARY_PICKUP_STORE_CANDIDATES_PER_TYPE,
      MAX_PRIMARY_PICKUP_STORE_CANDIDATES_PER_TYPE,
      MAX_PRIMARY_PICKUP_STORE_CANDIDATES_PER_TYPE
    ]
  );
  assert.equal(diagnostics.maximumRetainedCompletedPlans, 2);
  assert.ok(
    diagnostics.completeRouteEvaluations <=
      MAX_SEQUENTIAL_PICKUP_ROUTE_COMPLETION_EVALUATIONS
  );
});

test("four-pickup-type bounded routing is deterministic regardless of input ordering", () => {
  const { pickupTypes, stores, matrix } = largeBoundedRoutingFixture();
  const firstPlan = sequentialPlan(stores, matrix, pickupTypes);
  const secondPlan = sequentialPlan([...stores].reverse(), matrix, pickupTypes);

  assert.deepEqual(
    firstPlan.pickupStops.map((stop) => stop.storeId),
    secondPlan.pickupStops.map((stop) => stop.storeId)
  );
});

test("priority comparison uses the complete multi-stop journey", () => {
  const standardBeer = baseStore({ id: "standard-beer" });
  const preferredBeer = baseStore({
    id: "preferred-beer",
    routingPriority: "PREFERRED"
  });
  const lcbo = baseStore({ id: "lcbo", pickupType: "LCBO" });
  const plan = sequentialPlan(
    [standardBeer, preferredBeer, lcbo],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("standard-beer"), 20),
      route("driver:driver-a", pickupStoreRouteNodeId("preferred-beer"), 20),
      route("driver:driver-a", pickupStoreRouteNodeId("lcbo"), 1000),
      route(pickupStoreRouteNodeId("standard-beer"), pickupStoreRouteNodeId("lcbo"), 80),
      route(pickupStoreRouteNodeId("preferred-beer"), pickupStoreRouteNodeId("lcbo"), 230),
      route(pickupStoreRouteNodeId("lcbo"), "customer:order-a", 100)
    ],
    ["BEER_STORE", "LCBO"]
  );

  assert.deepEqual(
    plan.pickupStops.map((stop) => stop.storeId),
    ["preferred-beer", "lcbo"]
  );
  assert.equal(plan.totalDurationSeconds, 350);
});

test("equal preferred routes use a stable store-id tie-breaker", () => {
  const preferredB = baseStore({ id: "preferred-b", routingPriority: "PREFERRED" });
  const preferredA = baseStore({ id: "preferred-a", routingPriority: "PREFERRED" });
  const plan = sequentialPlan(
    [preferredB, preferredA],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("preferred-a"), 100),
      route("driver:driver-a", pickupStoreRouteNodeId("preferred-b"), 100),
      route(pickupStoreRouteNodeId("preferred-a"), "customer:order-a", 100),
      route(pickupStoreRouteNodeId("preferred-b"), "customer:order-a", 100)
    ],
    ["BEER_STORE"]
  );

  assert.equal(plan.pickupStops[0].storeId, "preferred-a");
});

test("arrival exactly three minutes before closing is eligible", () => {
  const result = evaluatePickupStoreEligibility(
    baseStore(),
    torontoTime(19, 57)
  );

  assert.equal(result.eligible, true);
  assert.equal(result.reason, "ELIGIBLE");
  assert.equal(result.closingTime, "20:00");
  assert.equal(result.closingBufferMinutes, 3);
});

test("arrival less than three minutes before closing is excluded", () => {
  const result = evaluatePickupStoreEligibility(
    baseStore(),
    torontoTime(19, 58)
  );

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "CLOSES_WITHIN_BUFFER");
});

test("current or holiday hours override regular monthly hours", () => {
  const result = evaluatePickupStoreEligibility(
    baseStore({
      currentOpeningHours: {
        periods: [
          {
            open: { day: 2, hour: 10, minute: 0 },
            close: { day: 2, hour: 18, minute: 0 }
          }
        ]
      }
    }),
    torontoTime(18, 5)
  );

  assert.equal(result.eligible, false);
  assert.equal(result.hoursSource, "CURRENT");
  assert.equal(result.reason, "NOT_OPEN_AT_ARRIVAL");
});

test("manual dated override has highest priority", () => {
  const result = evaluatePickupStoreEligibility(
    baseStore({
      currentOpeningHours: {
        periods: [
          {
            open: { day: 2, hour: 10, minute: 0 },
            close: { day: 2, hour: 22, minute: 0 }
          }
        ]
      },
      manualHoursOverride: [
        {
          date: "2026-09-08",
          isClosed: true
        }
      ]
    }),
    torontoTime(14, 0)
  );

  assert.equal(result.eligible, false);
  assert.equal(result.hoursSource, "MANUAL");
  assert.equal(result.reason, "MANUAL_CLOSED");
});

test("stores without trustworthy hours fail closed", () => {
  const result = evaluatePickupStoreEligibility(
    baseStore({ regularOpeningHours: null, currentOpeningHours: null }),
    torontoTime(14, 0)
  );

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "HOURS_UNAVAILABLE");
});

test("permanently closed stores are never eligible", () => {
  const result = evaluatePickupStoreEligibility(
    baseStore({ googleBusinessStatus: "CLOSED_PERMANENTLY" }),
    torontoTime(14, 0)
  );

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "BUSINESS_NOT_OPERATIONAL");
});

test("selector skips a nearer store that would close inside the buffer", () => {
  const nearStore = baseStore({ id: "near", name: "Near Beer Store" });
  const fartherStore = baseStore({
    id: "far",
    name: "Farther Beer Store",
    regularOpeningHours: {
      periods: [
        {
          open: { day: 2, hour: 10, minute: 0 },
          close: { day: 2, hour: 21, minute: 0 }
        }
      ]
    }
  });

  const recommendations = selectPickupStoreRecommendations({
    driverId: "driver-a",
    requiredPickupTypes: ["BEER_STORE"],
    stores: [nearStore, fartherStore],
    generatedAt: torontoTime(19, 53),
    matrix: [
      {
        originId: "driver-a",
        destinationId: "near",
        durationSeconds: 5 * 60,
        distanceMeters: 2500,
        routeAvailable: true
      },
      {
        originId: "driver-a",
        destinationId: "far",
        durationSeconds: 8 * 60,
        distanceMeters: 4100,
        routeAvailable: true
      }
    ]
  });

  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0].storeId, "far");
  assert.equal(recommendations[0].closingBufferMinutes, 3);
});

test("sequential routing rejects the closest store when its complete journey is slower", () => {
  const nearStore = baseStore({ id: "near", name: "Near Beer Store" });
  const farStore = baseStore({ id: "far", name: "Far Beer Store" });
  const plan = sequentialPlan(
    [nearStore, farStore],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("near"), 60),
      route("driver:driver-a", pickupStoreRouteNodeId("far"), 300),
      route(pickupStoreRouteNodeId("near"), "customer:order-a", 1200),
      route(pickupStoreRouteNodeId("far"), "customer:order-a", 300)
    ],
    ["BEER_STORE"]
  );

  assert.ok(plan);
  assert.equal(plan.pickupStops[0].storeId, "far");
  assert.equal(plan.totalDurationSeconds, 600);
  assert.equal(plan.customerLegDurationSeconds, 300);
});

test("sequential routing compares pickup stop orders and accumulates arrival at stop two", () => {
  const beerStore = baseStore({ id: "beer", pickupType: "BEER_STORE" });
  const lcboStore = baseStore({ id: "lcbo", pickupType: "LCBO" });
  const plan = sequentialPlan(
    [beerStore, lcboStore],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("beer"), 60),
      route("driver:driver-a", pickupStoreRouteNodeId("lcbo"), 70),
      route(pickupStoreRouteNodeId("beer"), pickupStoreRouteNodeId("lcbo"), 120),
      route(pickupStoreRouteNodeId("lcbo"), pickupStoreRouteNodeId("beer"), 600),
      route(pickupStoreRouteNodeId("beer"), "customer:order-a", 1000),
      route(pickupStoreRouteNodeId("lcbo"), "customer:order-a", 200)
    ],
    ["LCBO", "BEER_STORE"]
  );

  assert.ok(plan);
  assert.deepEqual(
    plan.pickupStops.map((stop) => stop.storeId),
    ["beer", "lcbo"]
  );
  assert.equal(plan.pickupStops[1].durationSeconds, 180);
  assert.equal(
    plan.pickupStops[1].projectedArrivalAt,
    "2026-09-08T16:03:00.000Z"
  );
  assert.equal(plan.totalDurationSeconds, 380);
});

test("sequential routing compares alternative store combinations", () => {
  const beerStoreA = baseStore({ id: "beer-a", pickupType: "BEER_STORE" });
  const beerStoreB = baseStore({ id: "beer-b", pickupType: "BEER_STORE" });
  const lcboStore = baseStore({ id: "lcbo", pickupType: "LCBO" });
  const plan = sequentialPlan(
    [beerStoreA, beerStoreB, lcboStore],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("beer-a"), 50),
      route("driver:driver-a", pickupStoreRouteNodeId("beer-b"), 100),
      route("driver:driver-a", pickupStoreRouteNodeId("lcbo"), 60),
      route(pickupStoreRouteNodeId("beer-a"), pickupStoreRouteNodeId("lcbo"), 1000),
      route(pickupStoreRouteNodeId("beer-b"), pickupStoreRouteNodeId("lcbo"), 100),
      route(pickupStoreRouteNodeId("lcbo"), "customer:order-a", 100)
    ],
    ["BEER_STORE", "LCBO"]
  );

  assert.ok(plan);
  assert.deepEqual(
    plan.pickupStops.map((stop) => stop.storeId),
    ["beer-b", "lcbo"]
  );
  assert.equal(plan.totalDurationSeconds, 300);
});

test("sequential routing rejects a second stop that closes within its arrival buffer", () => {
  const beerStore = baseStore({ id: "beer", pickupType: "BEER_STORE" });
  const closingLcboStore = baseStore({
    id: "lcbo",
    pickupType: "LCBO",
    regularOpeningHours: {
      periods: [
        {
          open: { day: 2, hour: 10, minute: 0 },
          close: { day: 2, hour: 19, minute: 5 }
        }
      ]
    }
  });
  const plan = sequentialPlan(
    [beerStore, closingLcboStore],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("beer"), 60),
      route("driver:driver-a", pickupStoreRouteNodeId("lcbo"), 60),
      route(pickupStoreRouteNodeId("beer"), pickupStoreRouteNodeId("lcbo"), 120),
      route(pickupStoreRouteNodeId("lcbo"), "customer:order-a", 100)
    ],
    ["BEER_STORE", "LCBO"],
    torontoTime(19, 0)
  );

  assert.equal(plan, null);
});

test("one-pickup and no-pickup routes include the required final customer leg", () => {
  const store = baseStore({ id: "beer" });
  const onePickupPlan = sequentialPlan(
    [store],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("beer"), 300),
      route(pickupStoreRouteNodeId("beer"), "customer:order-a", 480)
    ],
    ["BEER_STORE"]
  );
  const noPickupPlan = sequentialPlan(
    [],
    [route("driver:driver-a", "customer:order-a", 480)],
    []
  );

  assert.ok(onePickupPlan);
  assert.equal(onePickupPlan.pickupStops[0].durationSeconds, 300);
  assert.equal(onePickupPlan.totalDurationSeconds, 780);
  assert.ok(noPickupPlan);
  assert.deepEqual(noPickupPlan.pickupStops, []);
  assert.equal(noPickupPlan.totalDurationSeconds, 480);
});

test("sequential routing does not create an ETA when a required route leg is unavailable", () => {
  const store = baseStore({ id: "beer" });
  const plan = sequentialPlan(
    [store],
    [route("driver:driver-a", pickupStoreRouteNodeId("beer"), 300)],
    ["BEER_STORE"]
  );

  assert.equal(plan, null);
});

test("equal-duration sequential routes use a deterministic pickup sequence", () => {
  const beerStore = baseStore({ id: "beer", pickupType: "BEER_STORE" });
  const lcboStore = baseStore({ id: "lcbo", pickupType: "LCBO" });
  const plan = sequentialPlan(
    [lcboStore, beerStore],
    [
      route("driver:driver-a", pickupStoreRouteNodeId("beer"), 100),
      route("driver:driver-a", pickupStoreRouteNodeId("lcbo"), 100),
      route(pickupStoreRouteNodeId("beer"), pickupStoreRouteNodeId("lcbo"), 100),
      route(pickupStoreRouteNodeId("lcbo"), pickupStoreRouteNodeId("beer"), 100),
      route(pickupStoreRouteNodeId("beer"), "customer:order-a", 100),
      route(pickupStoreRouteNodeId("lcbo"), "customer:order-a", 100)
    ],
    ["LCBO", "BEER_STORE"]
  );

  assert.ok(plan);
  assert.deepEqual(
    plan.pickupStops.map((stop) => stop.pickupType),
    ["BEER_STORE", "LCBO"]
  );
});
