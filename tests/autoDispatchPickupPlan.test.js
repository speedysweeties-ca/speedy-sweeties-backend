const assert = require("node:assert/strict");
const test = require("node:test");
const { DispatchSource, OrderStatus } = require("@prisma/client");
const { prisma } = require("../dist/lib/prisma.js");

process.env.GOOGLE_ROUTES_API_KEY = "auto-dispatch-test-key";
process.env.AUTO_DISPATCH_ENABLED = "true";

const {
  autoDispatchCreatedOrderWithPickupPlan,
  selectAutoDispatchAllocationCandidate,
  shouldNotifyAutoDispatchedDriver
} = require("../dist/services/autoDispatchPickupPlan.service.js");

const replaceForTest = (t, target, property, replacement) => {
  const original = target[property];
  target[property] = replacement;
  t.after(() => {
    target[property] = original;
  });
};

const allocationDriver = (id, firstName, latitude, overrides = {}) => {
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
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
};

const autoDispatchOrder = (id, orderNumber, overrides = {}) => ({
  id,
  orderNumber,
  orderStatus: OrderStatus.PLACED,
  assignedDriverId: null,
  assignedAt: null,
  dispatchedAt: null,
  acceptedAt: null,
  outForDeliveryAt: null,
  deliveredAt: null,
  customerName: "Test Customer",
  addressLine1: "10 Test Street",
  city: "Guelph",
  deliveryLatitude: 43.54,
  deliveryLongitude: -80.25,
  geocodeStatus: "VERIFIED",
  items: [{ itemCatalog: { pickupType: "UNKNOWN" } }],
  ...overrides
});

const routePointId = (latitude) => {
  if (latitude === 43.51) return "driver-a";
  if (latitude === 43.52) return "driver-b";
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
    items: order.items?.map((item) => ({
      ...item,
      itemCatalog: item.itemCatalog && { ...item.itemCatalog }
    }))
  };

const installAllocationHarness = (t, options) => {
  const orderRows = new Map(
    options.orders.map((order) => [order.id, cloneOrder(order)])
  );
  const drivers = options.drivers.map((driver) => ({ ...driver }));
  const rowLockTails = new Map();
  const rawQueries = [];
  let rootOrderReadCount = 0;
  let stopDeleteCount = 0;
  let transactionCount = 0;
  let releaseRootOrderReads;
  const initialReadsReady = new Promise((resolve) => {
    releaseRootOrderReads = resolve;
  });

  const acquireOrderLock = async (orderId) => {
    const previousLock = rowLockTails.get(orderId) ?? Promise.resolve();
    let releaseLock;
    rowLockTails.set(
      orderId,
      new Promise((resolve) => {
        releaseLock = resolve;
      })
    );
    await previousLock;
    return releaseLock;
  };

  replaceForTest(t, global, "fetch", routeFetch(options.routeDurations));
  replaceForTest(t, prisma.systemSetting, "findUnique", async () => ({
    value: "true"
  }));
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
    transactionCount += 1;
    if (options.beforeFirstTransaction && transactionCount === 1) {
      options.beforeFirstTransaction(drivers);
    }

    let releaseLock;
    let lockedOrderId;
    let snapshot;
    const tx = {
      $queryRaw: async (queryStrings, ...queryValues) => {
        const queryText = Array.isArray(queryStrings)
          ? queryStrings.join(" ").replace(/\s+/g, " ").trim()
          : "";
        rawQueries.push(queryText);
        const orderId = queryValues.find(
          (value) => typeof value === "string" && orderRows.has(value)
        );
        if (!orderId) return [];

        releaseLock = await acquireOrderLock(orderId);
        lockedOrderId = orderId;
        snapshot = cloneOrder(orderRows.get(orderId));
        const order = orderRows.get(orderId);
        return order
          ? [
              {
                id: order.id,
                orderStatus: order.orderStatus,
                assignedDriverId: order.assignedDriverId,
                assignedAt: order.assignedAt,
                dispatchedAt: order.dispatchedAt,
                acceptedAt: order.acceptedAt,
                outForDeliveryAt: order.outForDeliveryAt,
                deliveredAt: order.deliveredAt
              }
            ]
          : [];
      },
      systemSetting: {
        findUnique: async () => ({ value: "true" })
      },
      user: {
        findMany: async () => drivers.map((driver) => ({ ...driver }))
      },
      order: {
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
        deleteMany: async () => {
          if (options.stopDeletionFailure) {
            throw new Error("simulated pickup-stop deletion failure");
          }
          stopDeleteCount += 1;
          return { count: 0 };
        }
      }
    };

    try {
      return await callback(tx);
    } catch (error) {
      if (lockedOrderId && snapshot) {
        orderRows.set(lockedOrderId, snapshot);
      }
      throw error;
    } finally {
      if (releaseLock) releaseLock();
    }
  });

  return {
    drivers,
    orderRows,
    getRawQueries: () => rawQueries,
    getStopDeleteCount: () => stopDeleteCount
  };
};

const directRouteDurations = (driverADuration = 60, driverBDuration = 120) => ({
  "driver-a->customer": driverADuration,
  "driver-b->customer": driverBDuration
});

test("automatic allocation chooses shortest direct travel time, then distance and identity", () => {
  const alpha = allocationDriver("driver-alpha", "Alpha", 43.51);
  const bravo = allocationDriver("driver-bravo", "Bravo", 43.52);
  const candidate = (driver, routeDurationSeconds, routeDistanceMeters) => ({
    driver,
    routeDurationSeconds,
    routeDistanceMeters
  });

  assert.equal(
    selectAutoDispatchAllocationCandidate([
      candidate(alpha, 600, 100),
      candidate(bravo, 60, 10000)
    ]).driver.id,
    "driver-bravo"
  );
  assert.equal(
    selectAutoDispatchAllocationCandidate([
      candidate(alpha, 60, 5000),
      candidate(bravo, 60, 1000)
    ]).driver.id,
    "driver-bravo"
  );
  assert.equal(
    selectAutoDispatchAllocationCandidate([
      candidate(bravo, 60, 1000),
      candidate(alpha, 60, 1000)
    ]).driver.id,
    "driver-alpha"
  );
});

test("unknown items do not block dispatch to the closest driver", async (t) => {
  const order = autoDispatchOrder("order-a", 101, {
    items: [
      { itemCatalog: null },
      { itemCatalog: { pickupType: "UNKNOWN" } }
    ]
  });
  const harness = installAllocationHarness(t, {
    orders: [order],
    drivers: [
      allocationDriver("driver-a", "Alpha", 43.51),
      allocationDriver("driver-b", "Bravo", 43.52)
    ],
    routeDurations: directRouteDurations(600, 60)
  });

  const result = await autoDispatchCreatedOrderWithPickupPlan("order-a");
  const assignedOrder = harness.orderRows.get("order-a");

  assert.equal(result.dispatched, true);
  assert.equal(result.driverId, "driver-b");
  assert.equal(result.routeDurationSeconds, 60);
  assert.deepEqual(result.pickupStops, []);
  assert.equal(assignedOrder.assignedDriverId, "driver-b");
  assert.equal(assignedOrder.orderStatus, OrderStatus.DISPATCHED);
  assert.equal(assignedOrder.dispatchSource, DispatchSource.AUTO);
  assert.equal(harness.getStopDeleteCount(), 1);
  assert.equal(harness.getRawQueries().length, 1);
  assert.equal(harness.getRawQueries()[0].includes("pg_advisory"), false);
  assert.equal(shouldNotifyAutoDispatchedDriver(result), true);
});

test("concurrent orders can both go to the same closest driver", async (t) => {
  const harness = installAllocationHarness(t, {
    orders: [autoDispatchOrder("order-a", 101), autoDispatchOrder("order-b", 102)],
    drivers: [
      allocationDriver("driver-a", "Alpha", 43.51),
      allocationDriver("driver-b", "Bravo", 43.52)
    ],
    routeDurations: directRouteDurations(600, 60),
    waitForInitialOrderReads: 2
  });

  const results = await Promise.all([
    autoDispatchCreatedOrderWithPickupPlan("order-a"),
    autoDispatchCreatedOrderWithPickupPlan("order-b")
  ]);

  assert.equal(results.every((result) => result.dispatched), true);
  assert.equal(harness.orderRows.get("order-a").assignedDriverId, "driver-b");
  assert.equal(harness.orderRows.get("order-b").assignedDriverId, "driver-b");
  assert.equal(harness.getRawQueries().length, 2);
  assert.equal(
    harness.getRawQueries().every((query) => !query.includes("pg_advisory")),
    true
  );
});

test("concurrent attempts for one order commit once and notify once", async (t) => {
  const harness = installAllocationHarness(t, {
    orders: [autoDispatchOrder("order-a", 101)],
    drivers: [allocationDriver("driver-a", "Alpha", 43.51)],
    routeDurations: directRouteDurations(),
    waitForInitialOrderReads: 2
  });

  const results = await Promise.all([
    autoDispatchCreatedOrderWithPickupPlan("order-a"),
    autoDispatchCreatedOrderWithPickupPlan("order-a")
  ]);

  assert.equal(results.filter((result) => result.dispatched).length, 1);
  assert.equal(
    results.filter(shouldNotifyAutoDispatchedDriver).length,
    1
  );
  assert.equal(harness.orderRows.get("order-a").assignedDriverId, "driver-a");
  assert.equal(harness.orderRows.get("order-a").orderStatus, OrderStatus.DISPATCHED);
});

test("stale driver presence and GPS are excluded", async (t) => {
  const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const harness = installAllocationHarness(t, {
    orders: [autoDispatchOrder("order-a", 101)],
    drivers: [
      allocationDriver("driver-a", "Alpha", 43.51, {
        lastSeenAt: staleAt,
        locationUpdatedAt: staleAt
      }),
      allocationDriver("driver-b", "Bravo", 43.52)
    ],
    routeDurations: directRouteDurations(30, 300)
  });

  const result = await autoDispatchCreatedOrderWithPickupPlan("order-a");

  assert.equal(result.dispatched, true);
  assert.equal(result.driverId, "driver-b");
  assert.equal(harness.orderRows.get("order-a").assignedDriverId, "driver-b");
});

test("a driver whose GPS changes after routing is not assigned from a stale route", async (t) => {
  const harness = installAllocationHarness(t, {
    orders: [autoDispatchOrder("order-a", 101)],
    drivers: [
      allocationDriver("driver-a", "Alpha", 43.51),
      allocationDriver("driver-b", "Bravo", 43.52)
    ],
    routeDurations: directRouteDurations(30, 300),
    beforeFirstTransaction: (drivers) => {
      drivers[0].latitude = 43.515;
      drivers[0].locationUpdatedAt = new Date(
        drivers[0].locationUpdatedAt.getTime() + 1000
      );
    }
  });

  const result = await autoDispatchCreatedOrderWithPickupPlan("order-a");

  assert.equal(result.dispatched, true);
  assert.equal(result.driverId, "driver-b");
  assert.equal(harness.orderRows.get("order-a").assignedDriverId, "driver-b");
});

test("an unavailable direct route leaves the order unassigned", async (t) => {
  const harness = installAllocationHarness(t, {
    orders: [autoDispatchOrder("order-a", 101)],
    drivers: [allocationDriver("driver-a", "Alpha", 43.51)],
    routeDurations: {}
  });

  const result = await autoDispatchCreatedOrderWithPickupPlan("order-a");

  assert.equal(result.dispatched, false);
  assert.equal(result.reason, "ROUTING_UNAVAILABLE");
  assert.equal(harness.orderRows.get("order-a").assignedDriverId, null);
});

test("a transaction failure rolls back the assignment", async (t) => {
  const harness = installAllocationHarness(t, {
    orders: [autoDispatchOrder("order-a", 101)],
    drivers: [allocationDriver("driver-a", "Alpha", 43.51)],
    routeDurations: directRouteDurations(),
    stopDeletionFailure: true
  });

  const result = await autoDispatchCreatedOrderWithPickupPlan("order-a");

  assert.equal(result.dispatched, false);
  assert.equal(result.reason, "ALLOCATION_UNAVAILABLE");
  assert.equal(harness.orderRows.get("order-a").assignedDriverId, null);
  assert.equal(harness.orderRows.get("order-a").orderStatus, OrderStatus.PLACED);
});
