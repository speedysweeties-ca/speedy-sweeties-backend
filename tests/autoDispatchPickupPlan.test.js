const assert = require("node:assert/strict");
const test = require("node:test");
const { OrderStatus } = require("@prisma/client");
const { prisma } = require("../dist/lib/prisma.js");

process.env.GOOGLE_ROUTES_API_KEY = "auto-dispatch-test-key";
process.env.AUTO_DISPATCH_ENABLED = "true";

const {
  AUTO_DISPATCH_ALLOCATION_LOCK_KEY,
  AUTO_DISPATCH_ALLOCATION_LOCK_NAMESPACE,
  autoDispatchCreatedOrderWithPickupPlan,
  orderPickupRecommendations,
  selectAutoDispatchAllocationCandidate,
  shouldNotifyAutoDispatchedDriver
} = require("../dist/services/autoDispatchPickupPlan.service.js");

const recommendation = (overrides = {}) => ({
  pickupType: "BEER_STORE",
  storeId: "store-a",
  storeName: "The Beer Store - Municipal Street",
  addressLine1: "710 Municipal Street",
  city: "Guelph",
  province: "ON",
  etaMinutes: 8,
  durationSeconds: 480,
  distanceMeters: 4200,
  projectedArrivalAt: "2026-09-09T00:08:00.000Z",
  hoursSource: "CURRENT",
  closingDate: "2026-09-08",
  closingTime: "20:00",
  closingBufferMinutes: 3,
  ...overrides
});

const replaceForTest = (t, target, property, replacement) => {
  const original = target[property];
  target[property] = replacement;
  t.after(() => {
    target[property] = original;
  });
};

const allocationDriver = (id, firstName, latitude) => {
  const now = new Date();
  return {
    id,
    firstName,
    lastName: "Driver",
    email: `${id}@example.com`,
    isOnline: true,
    driverFcmToken: `${id}-fcm-token`,
    driverAppState: "BACKGROUND",
    lastSeenAt: now,
    latitude,
    longitude: -80.25,
    locationUpdatedAt: now,
    createdAt: new Date("2026-01-01T00:00:00.000Z")
  };
};

const autoDispatchOrder = (id, orderNumber) => ({
  id,
  orderNumber,
  orderStatus: OrderStatus.PLACED,
  assignedDriverId: null,
  customerName: "Test Customer",
  addressLine1: "10 Test Street",
  city: "Guelph",
  deliveryLatitude: 43.54,
  deliveryLongitude: -80.25,
  geocodeStatus: "VERIFIED",
  items: [{ itemCatalog: { pickupType: "BEER_STORE" } }]
});

const alwaysOpenStore = {
  id: "store-1",
  name: "Always Open Store",
  pickupType: "BEER_STORE",
  addressLine1: "20 Store Street",
  city: "Guelph",
  province: "ON",
  latitude: 43.53,
  longitude: -80.25,
  googleBusinessStatus: "OPERATIONAL",
  regularOpeningHours: {
    periods: [{ open: { day: 0, hour: 0, minute: 0 } }]
  },
  currentOpeningHours: null,
  manualHoursOverride: null
};

const routePointId = (latitude) => {
  if (latitude === 43.51) return "driver-a";
  if (latitude === 43.52) return "driver-b";
  if (latitude === 43.53) return "store";
  if (latitude === 43.54) return "customer";
  return "unknown";
};

const routeFetch = (durations) => async (_url, options) => {
  const body = JSON.parse(options.body);
  const payload = body.origins.flatMap((origin, originIndex) => {
    const originId = routePointId(origin.waypoint.location.latLng.latitude);
    return body.destinations.map((destination, destinationIndex) => {
      const destinationId = routePointId(
        destination.waypoint.location.latLng.latitude
      );
      const durationSeconds = durations[`${originId}->${destinationId}`];

      if (durationSeconds === undefined) {
        return {
          originIndex,
          destinationIndex,
          status: {},
          condition: "ROUTE_NOT_FOUND"
        };
      }

      return {
        originIndex,
        destinationIndex,
        status: {},
        condition: "ROUTE_EXISTS",
        distanceMeters: durationSeconds * 10,
        duration: `${durationSeconds}s`
      };
    });
  });

  return {
    ok: true,
    status: 200,
    json: async () => payload
  };
};

const cloneOrder = (order) =>
  order && {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      itemCatalog: item.itemCatalog && { ...item.itemCatalog }
    }))
  };

const installAllocationHarness = (t, options) => {
  const orderRows = new Map(
    options.orders.map((order) => [order.id, cloneOrder(order)])
  );
  const stopsByOrder = new Map(options.orders.map((order) => [order.id, []]));
  const drivers = options.drivers.map((driver) => ({ ...driver }));
  let advisoryLockTail = Promise.resolve();
  let advisoryLockCount = 0;
  const advisoryLockQueries = [];
  const advisoryLockValues = [];
  let stopCreationFailure = options.stopCreationFailure === true;
  let rootOrderReadCount = 0;
  let releaseRootOrderReads;
  const initialReadsReady = new Promise((resolve) => {
    releaseRootOrderReads = resolve;
  });

  const snapshotState = () => ({
    orders: Array.from(orderRows.entries()).map(([id, order]) => [id, cloneOrder(order)]),
    stops: Array.from(stopsByOrder.entries()).map(([id, stops]) => [
      id,
      stops.map((stop) => ({ ...stop }))
    ])
  });
  const restoreState = (snapshot) => {
    orderRows.clear();
    snapshot.orders.forEach(([id, order]) => orderRows.set(id, order));
    stopsByOrder.clear();
    snapshot.stops.forEach(([id, stops]) => stopsByOrder.set(id, stops));
  };
  const acquireAdvisoryLock = async () => {
    const previousLock = advisoryLockTail;
    let releaseLock;
    advisoryLockTail = new Promise((resolve) => {
      releaseLock = resolve;
    });
    await previousLock;
    return releaseLock;
  };

  replaceForTest(t, global, "fetch", routeFetch(options.routeDurations));
  replaceForTest(t, prisma.systemSetting, "findUnique", async () => ({
    value: "true"
  }));
  replaceForTest(t, prisma.pickupLocation, "findMany", async () => [
    { ...alwaysOpenStore }
  ]);
  replaceForTest(t, prisma.user, "findMany", async () =>
    drivers.map((driver) => ({ ...driver }))
  );
  replaceForTest(t, prisma.order, "findUnique", async ({ where }) => {
    rootOrderReadCount += 1;
    if (
      options.waitForInitialOrderReads &&
      rootOrderReadCount <= options.waitForInitialOrderReads
    ) {
      if (rootOrderReadCount === options.waitForInitialOrderReads) {
        releaseRootOrderReads();
      }
      await initialReadsReady;
    }
    return cloneOrder(orderRows.get(where.id));
  });
  replaceForTest(t, prisma, "$transaction", async (callback) => {
    let releaseLock;
    let snapshot;
    const tx = {
      $queryRaw: async (queryStrings, ...queryValues) => {
        const queryText = Array.isArray(queryStrings)
          ? queryStrings.join(" ")
          : "";
        if (queryText.includes('FROM "Order"')) {
          const orderId = queryValues.find(
            (value) => typeof value === "string" && orderRows.has(value)
          );
          const order = orderRows.get(orderId);
          return order
            ? [
                {
                  id: order.id,
                  orderStatus: order.orderStatus,
                  assignedDriverId: order.assignedDriverId
                }
              ]
            : [];
        }

        releaseLock = await acquireAdvisoryLock();
        advisoryLockCount += 1;
        advisoryLockQueries.push(queryText.replace(/\s+/g, " ").trim());
        advisoryLockValues.push(queryValues);
        snapshot = snapshotState();
        return [];
      },
      systemSetting: {
        findUnique: async () => ({ value: "true" })
      },
      user: {
        findMany: async () => drivers.map((driver) => ({ ...driver }))
      },
      order: {
        count: async ({ where }) =>
          Array.from(orderRows.values()).filter(
            (order) =>
              order.assignedDriverId === where.assignedDriverId &&
              where.orderStatus.in.includes(order.orderStatus)
          ).length,
        updateMany: async ({ where, data }) => {
          const order = orderRows.get(where.id);
          if (
            !order ||
            order.orderStatus !== where.orderStatus ||
            order.assignedDriverId !== where.assignedDriverId
          ) {
            return { count: 0 };
          }

          Object.assign(order, data);
          return { count: 1 };
        }
      },
      orderPickupStop: {
        deleteMany: async ({ where }) => {
          stopsByOrder.set(where.orderId, []);
          return { count: 1 };
        },
        create: async ({ data }) => {
          if (stopCreationFailure) {
            throw new Error("simulated pickup-stop persistence failure");
          }
          stopsByOrder.get(data.orderId).push({ ...data });
          return { id: `stop-${data.sequence}` };
        }
      }
    };

    try {
      return await callback(tx);
    } catch (error) {
      if (snapshot) restoreState(snapshot);
      throw error;
    } finally {
      if (releaseLock) releaseLock();
    }
  });

  return {
    orderRows,
    stopsByOrder,
    getAdvisoryLockCount: () => advisoryLockCount,
    getAdvisoryLockQueries: () => advisoryLockQueries,
    getAdvisoryLockValues: () => advisoryLockValues,
    setStopCreationFailure: (value) => {
      stopCreationFailure = value;
    }
  };
};

const singleStopRouteDurations = (driverADuration = 60, driverBDuration = 60) => ({
  "driver-a->store": driverADuration,
  "driver-b->store": driverBDuration,
  "store->customer": 120
});

test("an incomplete recommendation set cannot become an auto-dispatch pickup plan", () => {
  const result = orderPickupRecommendations([
    recommendation(),
    { pickupType: "LCBO", unavailable: true }
  ]);

  assert.equal(result, null);
});

test("persisted pickup stops retain the selected travel sequence", () => {
  const result = orderPickupRecommendations([
    recommendation({
      pickupType: "LCBO",
      storeId: "lcbo-a",
      storeName: "LCBO - Scottsdale Drive",
      durationSeconds: 720,
      etaMinutes: 12
    }),
    recommendation({
      pickupType: "BEER_STORE",
      storeId: "beer-a",
      storeName: "The Beer Store - Municipal Street",
      durationSeconds: 300,
      etaMinutes: 5
    })
  ]);

  assert.ok(result);
  assert.equal(result.length, 2);
  assert.equal(result[0].pickupType, "LCBO");
  assert.equal(result[0].sequence, 1);
  assert.equal(result[1].pickupType, "BEER_STORE");
  assert.equal(result[1].sequence, 2);
});

test("persisted pickup stops preserve the three-minute closing safety data", () => {
  const result = orderPickupRecommendations([recommendation()]);

  assert.ok(result);
  assert.equal(result[0].closingBufferMinutes, 3);
  assert.equal(result[0].closingTime, "20:00");
  assert.equal(result[0].hoursSource, "CURRENT");
  assert.equal(result[0].storeName, "The Beer Store - Municipal Street");
});

test("automatic allocation prioritizes workload, then complete route duration, then driver identity", () => {
  const alpha = allocationDriver("driver-alpha", "Alpha", 43.51);
  const bravo = allocationDriver("driver-bravo", "Bravo", 43.52);
  const candidate = (driver, activeOrderCount, routeDurationSeconds) => ({
    driver,
    activeOrderCount,
    routeDurationSeconds,
    pickupStops: []
  });

  assert.equal(
    selectAutoDispatchAllocationCandidate([
      candidate(alpha, 1, 60),
      candidate(bravo, 0, 600)
    ]).driver.id,
    "driver-bravo"
  );
  assert.equal(
    selectAutoDispatchAllocationCandidate([
      candidate(alpha, 0, 600),
      candidate(bravo, 0, 60)
    ]).driver.id,
    "driver-bravo"
  );
  assert.equal(
    selectAutoDispatchAllocationCandidate([
      candidate(bravo, 0, 60),
      candidate(alpha, 0, 60)
    ]).driver.id,
    "driver-alpha"
  );

  const sameNameA = allocationDriver("driver-z", "Same", 43.51);
  const sameNameB = allocationDriver("driver-a", "Same", 43.52);
  sameNameA.email = "same@example.com";
  sameNameB.email = "same@example.com";
  assert.equal(
    selectAutoDispatchAllocationCandidate([
      candidate(sameNameA, 0, 60),
      candidate(sameNameB, 0, 60)
    ]).driver.id,
    "driver-a"
  );
});

test("concurrent auto-dispatches re-read workload after the first committed assignment", async (t) => {
  const harness = installAllocationHarness(t, {
    orders: [autoDispatchOrder("order-a", 101), autoDispatchOrder("order-b", 102)],
    drivers: [
      allocationDriver("driver-a", "Alpha", 43.51),
      allocationDriver("driver-b", "Bravo", 43.52)
    ],
    routeDurations: singleStopRouteDurations(),
    waitForInitialOrderReads: 2
  });

  const results = await Promise.all([
    autoDispatchCreatedOrderWithPickupPlan("order-a"),
    autoDispatchCreatedOrderWithPickupPlan("order-b")
  ]);
  const assignedDriverIds = [
    harness.orderRows.get("order-a").assignedDriverId,
    harness.orderRows.get("order-b").assignedDriverId
  ].sort();

  assert.equal(results.every((result) => result.dispatched), true);
  assert.deepEqual(assignedDriverIds, ["driver-a", "driver-b"]);
  assert.equal(harness.stopsByOrder.get("order-a").length, 1);
  assert.equal(harness.stopsByOrder.get("order-b").length, 1);
  assert.equal(harness.getAdvisoryLockCount(), 2);
  assert.deepEqual(harness.getAdvisoryLockValues(), [
    [AUTO_DISPATCH_ALLOCATION_LOCK_NAMESPACE, AUTO_DISPATCH_ALLOCATION_LOCK_KEY],
    [AUTO_DISPATCH_ALLOCATION_LOCK_NAMESPACE, AUTO_DISPATCH_ALLOCATION_LOCK_KEY]
  ]);
  assert.deepEqual(harness.getAdvisoryLockQueries(), [
    "SELECT pg_advisory_xact_lock( CAST( AS integer), CAST( AS integer) )",
    "SELECT pg_advisory_xact_lock( CAST( AS integer), CAST( AS integer) )"
  ]);
  assert.equal(
    results.filter(shouldNotifyAutoDispatchedDriver).length,
    2
  );
});

test("a sole eligible driver can receive concurrent automatic assignments", async (t) => {
  const harness = installAllocationHarness(t, {
    orders: [autoDispatchOrder("order-a", 101), autoDispatchOrder("order-b", 102)],
    drivers: [allocationDriver("driver-a", "Alpha", 43.51)],
    routeDurations: singleStopRouteDurations(),
    waitForInitialOrderReads: 2
  });

  const results = await Promise.all([
    autoDispatchCreatedOrderWithPickupPlan("order-a"),
    autoDispatchCreatedOrderWithPickupPlan("order-b")
  ]);

  assert.equal(results.every((result) => result.dispatched), true);
  assert.equal(harness.orderRows.get("order-a").assignedDriverId, "driver-a");
  assert.equal(harness.orderRows.get("order-b").assignedDriverId, "driver-a");
  assert.equal(harness.stopsByOrder.get("order-a").length, 1);
  assert.equal(harness.stopsByOrder.get("order-b").length, 1);
});

test("concurrent attempts for one order commit once and schedule one driver notification", async (t) => {
  const harness = installAllocationHarness(t, {
    orders: [autoDispatchOrder("order-a", 101)],
    drivers: [
      allocationDriver("driver-a", "Alpha", 43.51),
      allocationDriver("driver-b", "Bravo", 43.52)
    ],
    routeDurations: singleStopRouteDurations(),
    waitForInitialOrderReads: 2
  });

  const results = await Promise.all([
    autoDispatchCreatedOrderWithPickupPlan("order-a"),
    autoDispatchCreatedOrderWithPickupPlan("order-a")
  ]);
  const successfulResults = results.filter((result) => result.dispatched);

  assert.equal(successfulResults.length, 1);
  assert.equal(harness.orderRows.get("order-a").orderStatus, OrderStatus.DISPATCHED);
  assert.equal(harness.orderRows.get("order-a").assignedDriverId, "driver-a");
  assert.equal(harness.stopsByOrder.get("order-a").length, 1);
  assert.equal(
    results.filter(shouldNotifyAutoDispatchedDriver).length,
    1
  );
});

test("a rolled-back allocation leaves no assignment or stops and releases the advisory lock", async (t) => {
  const harness = installAllocationHarness(t, {
    orders: [autoDispatchOrder("order-a", 101)],
    drivers: [allocationDriver("driver-a", "Alpha", 43.51)],
    routeDurations: singleStopRouteDurations(),
    stopCreationFailure: true
  });

  const failedResult = await autoDispatchCreatedOrderWithPickupPlan("order-a");

  assert.equal(failedResult.dispatched, false);
  assert.equal(failedResult.reason, "ALLOCATION_UNAVAILABLE");
  assert.equal(harness.orderRows.get("order-a").orderStatus, OrderStatus.PLACED);
  assert.equal(harness.orderRows.get("order-a").assignedDriverId, null);
  assert.equal(harness.stopsByOrder.get("order-a").length, 0);

  harness.setStopCreationFailure(false);
  const retryResult = await autoDispatchCreatedOrderWithPickupPlan("order-a");

  assert.equal(retryResult.dispatched, true);
  assert.equal(harness.orderRows.get("order-a").assignedDriverId, "driver-a");
  assert.equal(harness.stopsByOrder.get("order-a").length, 1);
  assert.equal(harness.getAdvisoryLockCount(), 2);
});
