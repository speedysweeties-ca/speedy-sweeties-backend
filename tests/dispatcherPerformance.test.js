const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DispatchEventType,
  DispatchSource,
  OrderSource,
  OrderStatus,
  UserRole
} = require("@prisma/client");
const {
  buildDispatcherPerformance,
  getDispatcherPerformanceSourceGroup
} = require("../dist/services/dispatcherPerformance.service.js");
const {
  normalizeManualEntryStartedAt
} = require("../dist/services/dispatcherPerformanceTracking.service.js");

const at = (value) => new Date(value);

const dispatchers = [
  {
    id: "dispatcher-1",
    firstName: "Dana",
    lastName: "Dispatch",
    role: UserRole.DISPATCHER,
    isActive: true
  },
  {
    id: "admin-1",
    firstName: "Alex",
    lastName: "Admin",
    role: UserRole.ADMIN,
    isActive: true
  }
];

const order = (overrides) => ({
  id: overrides.id,
  orderNumber: overrides.orderNumber,
  orderStatus: OrderStatus.DELIVERED,
  orderSource: OrderSource.ANDROID_APP,
  dispatchSource: DispatchSource.MANUAL,
  createdAt: at("2026-09-10T16:00:00.000Z"),
  manualEntryStartedAt: null,
  createdByUserId: null,
  dispatchedAt: at("2026-09-10T16:02:00.000Z"),
  dispatchedByUserId: "dispatcher-1",
  deliveredAt: at("2026-09-10T16:30:00.000Z"),
  cancelledAt: null,
  ...overrides
});

test("groups Android/iOS, Webflow, manual, and unknown sources for reporting", () => {
  assert.equal(
    getDispatcherPerformanceSourceGroup(OrderSource.ANDROID_APP),
    "APP"
  );
  assert.equal(getDispatcherPerformanceSourceGroup(OrderSource.IOS_APP), "APP");
  assert.equal(getDispatcherPerformanceSourceGroup(OrderSource.WEBFLOW), "ONLINE");
  assert.equal(
    getDispatcherPerformanceSourceGroup(OrderSource.DISPATCHER_MANUAL),
    "MANUAL"
  );
  assert.equal(getDispatcherPerformanceSourceGroup(OrderSource.UNKNOWN), "UNKNOWN");
});

test("builds dispatcher metrics from first-dispatch attribution without crediting auto dispatch", () => {
  const orders = [
    order({ id: "order-1", orderNumber: 101 }),
    order({
      id: "order-2",
      orderNumber: 102,
      orderStatus: OrderStatus.CANCELLED,
      orderSource: OrderSource.WEBFLOW,
      createdAt: at("2026-09-10T17:00:00.000Z"),
      dispatchedAt: at("2026-09-10T17:10:00.000Z"),
      deliveredAt: null,
      cancelledAt: at("2026-09-10T17:15:00.000Z")
    }),
    order({
      id: "order-3",
      orderNumber: 103,
      orderSource: OrderSource.DISPATCHER_MANUAL,
      createdAt: at("2026-09-10T18:00:00.000Z"),
      manualEntryStartedAt: at("2026-09-10T17:55:00.000Z"),
      createdByUserId: "admin-1",
      dispatchedAt: at("2026-09-10T18:01:00.000Z"),
      dispatchedByUserId: "admin-1",
      deliveredAt: at("2026-09-10T19:01:00.000Z")
    }),
    order({
      id: "order-4",
      orderNumber: 104,
      dispatchSource: DispatchSource.AUTO,
      dispatchedByUserId: null
    }),
    order({
      id: "order-5",
      orderNumber: 105,
      orderSource: OrderSource.UNKNOWN,
      dispatchSource: null,
      dispatchedByUserId: null
    })
  ];
  const events = [
    {
      orderId: "order-1",
      eventType: DispatchEventType.ASSIGNED,
      dispatchSource: DispatchSource.MANUAL,
      actorUserId: "dispatcher-1",
      occurredAt: at("2026-09-10T16:02:00.000Z")
    },
    {
      orderId: "order-1",
      eventType: DispatchEventType.REASSIGNED,
      dispatchSource: DispatchSource.MANUAL,
      actorUserId: "dispatcher-1",
      occurredAt: at("2026-09-10T16:05:00.000Z")
    },
    {
      orderId: "order-1",
      eventType: DispatchEventType.UNASSIGNED,
      dispatchSource: DispatchSource.MANUAL,
      actorUserId: "dispatcher-1",
      occurredAt: at("2026-09-10T16:06:00.000Z")
    }
  ];

  const result = buildDispatcherPerformance({ dispatchers, orders, events });
  const dana = result.stats.find((stat) => stat.dispatcherId === "dispatcher-1");
  const alex = result.stats.find((stat) => stat.dispatcherId === "admin-1");

  assert.equal(dana.ordersDispatched, 2);
  assert.equal(dana.averageDispatchMinutes, 6);
  assert.equal(dana.medianDispatchMinutes, 6);
  assert.equal(dana.p90DispatchMinutes, 10);
  assert.equal(dana.withinFiveMinutesPercent, 50);
  assert.equal(dana.averageTotalDeliveryMinutes, 30);
  assert.equal(dana.averagePostDispatchDeliveryMinutes, 28);
  assert.equal(dana.cancelledOrders, 1);
  assert.equal(dana.assignmentActions, 2);
  assert.equal(dana.reassignments, 1);
  assert.equal(dana.unassignments, 1);
  assert.equal(
    dana.sourceBreakdown.find((source) => source.sourceGroup === "APP").totalOrders,
    1
  );
  assert.equal(
    dana.sourceBreakdown.find((source) => source.sourceGroup === "ONLINE").totalOrders,
    1
  );

  assert.equal(alex.ordersDispatched, 1);
  assert.equal(alex.manualOrdersCreated, 1);
  assert.equal(alex.averageManualEntryMinutes, 5);
  assert.equal(result.summary.ordersDispatched, 3);
  assert.equal(result.coverage.totalOrders, 5);
  assert.equal(result.coverage.automaticDispatches, 1);
  assert.equal(result.coverage.unattributedDispatches, 1);
  assert.equal(result.coverage.unknownSourceOrders, 1);
  assert.equal(result.orders.length, 3);
});

test("dispatcher selection recomputes the summary while retaining overall coverage", () => {
  const orders = [
    order({ id: "order-1", orderNumber: 101 }),
    order({
      id: "order-2",
      orderNumber: 102,
      dispatchedByUserId: "admin-1",
      createdByUserId: "admin-1",
      orderSource: OrderSource.DISPATCHER_MANUAL
    })
  ];

  const result = buildDispatcherPerformance({
    dispatchers,
    orders,
    events: [],
    selectedDispatcherIds: ["admin-1"]
  });

  assert.equal(result.stats.length, 1);
  assert.equal(result.stats[0].dispatcherId, "admin-1");
  assert.equal(result.summary.ordersDispatched, 1);
  assert.equal(result.summary.manualOrdersCreated, 1);
  assert.equal(result.coverage.totalOrders, 2);
});

test("first-dispatch performance survives a later unassignment that clears current order attribution", () => {
  const orders = [
    order({
      id: "order-unassigned",
      orderNumber: 106,
      orderStatus: OrderStatus.PLACED,
      dispatchSource: null,
      dispatchedAt: null,
      dispatchedByUserId: null,
      deliveredAt: null
    })
  ];
  const events = [
    {
      orderId: "order-unassigned",
      eventType: DispatchEventType.ASSIGNED,
      dispatchSource: DispatchSource.MANUAL,
      actorUserId: "dispatcher-1",
      occurredAt: at("2026-09-10T16:03:00.000Z")
    },
    {
      orderId: "order-unassigned",
      eventType: DispatchEventType.UNASSIGNED,
      dispatchSource: DispatchSource.MANUAL,
      actorUserId: "admin-1",
      occurredAt: at("2026-09-10T16:04:00.000Z")
    }
  ];

  const result = buildDispatcherPerformance({ dispatchers, orders, events });
  const dana = result.stats.find((stat) => stat.dispatcherId === "dispatcher-1");
  const alex = result.stats.find((stat) => stat.dispatcherId === "admin-1");

  assert.equal(dana.ordersDispatched, 1);
  assert.equal(dana.averageDispatchMinutes, 3);
  assert.equal(alex.unassignments, 1);
  assert.equal(result.orders[0].dispatcherId, "dispatcher-1");
  assert.equal(
    result.orders[0].dispatchedAt.toISOString(),
    "2026-09-10T16:03:00.000Z"
  );
});

test("manual-entry start time accepts small clock skew and rejects untrustworthy durations", () => {
  const now = at("2026-09-10T18:00:00.000Z");

  assert.equal(
    normalizeManualEntryStartedAt("2026-09-10T17:55:00.000Z", now).toISOString(),
    "2026-09-10T17:55:00.000Z"
  );
  assert.equal(
    normalizeManualEntryStartedAt("2026-09-10T18:00:30.000Z", now).toISOString(),
    now.toISOString()
  );
  assert.equal(
    normalizeManualEntryStartedAt("2026-09-10T12:00:00.000Z", now),
    null
  );
});
