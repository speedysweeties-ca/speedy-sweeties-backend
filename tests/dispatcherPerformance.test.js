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
const {
  readDispatcherPerformanceDispatcherIds,
  readDispatcherPerformanceSourceGroups,
  readDispatcherPerformanceOverFiveMinutesOnly,
  getDispatcherPerformanceController
} = require("../dist/controllers/dispatcherPerformance.controller.js");

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

test("accepts POST-body filter arrays and rejects unknown order sources", () => {
  assert.deepEqual(
    readDispatcherPerformanceDispatcherIds([
      "dispatcher-1",
      "dispatcher-1",
      "admin-1"
    ]),
    ["dispatcher-1", "admin-1"]
  );
  assert.deepEqual(
    readDispatcherPerformanceSourceGroups(["online", "APP", "online"]),
    ["ONLINE", "APP"]
  );
  assert.throws(
    () => readDispatcherPerformanceSourceGroups(["ONLINE", "KIOSK"]),
    /Invalid order source: KIOSK/
  );
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
  assert.equal(dana.longestDispatchMinutes, 10);
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
  assert.equal(
    dana.sourceBreakdown.find((source) => source.sourceGroup === "ONLINE")
      .longestDispatchMinutes,
    10
  );

  assert.equal(alex.ordersDispatched, 1);
  assert.equal(alex.manualOrdersCreated, 1);
  assert.equal(alex.averageManualEntryMinutes, 5);
  assert.equal(result.summary.ordersDispatched, 3);
  assert.equal(result.summary.longestDispatchMinutes, 10);
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
  assert.equal(result.coverage.allOrdersInRange, 2);
});

test("order-source selection intersects with dispatcher selection across the report", () => {
  const orders = [
    order({ id: "order-app-dana", orderNumber: 201 }),
    order({
      id: "order-web-dana",
      orderNumber: 202,
      orderSource: OrderSource.WEBFLOW,
      createdAt: at("2026-09-10T17:00:00.000Z"),
      dispatchedAt: at("2026-09-10T17:04:00.000Z")
    }),
    order({
      id: "order-web-alex",
      orderNumber: 203,
      orderSource: OrderSource.WEBFLOW,
      createdAt: at("2026-09-10T18:00:00.000Z"),
      dispatchedAt: at("2026-09-10T18:08:00.000Z"),
      dispatchedByUserId: "admin-1"
    })
  ];
  const events = [
    {
      orderId: "order-app-dana",
      eventType: DispatchEventType.REASSIGNED,
      dispatchSource: DispatchSource.MANUAL,
      actorUserId: "dispatcher-1",
      occurredAt: at("2026-09-10T16:05:00.000Z")
    },
    {
      orderId: "order-web-alex",
      eventType: DispatchEventType.REASSIGNED,
      dispatchSource: DispatchSource.MANUAL,
      actorUserId: "admin-1",
      occurredAt: at("2026-09-10T18:09:00.000Z")
    }
  ];

  const result = buildDispatcherPerformance({
    dispatchers,
    orders,
    events,
    selectedDispatcherIds: ["admin-1"],
    selectedSourceGroups: ["ONLINE"]
  });

  assert.deepEqual(result.selectedSourceGroups, ["ONLINE"]);
  assert.equal(result.stats.length, 1);
  assert.equal(result.stats[0].dispatcherId, "admin-1");
  assert.equal(result.stats[0].ordersDispatched, 1);
  assert.equal(result.stats[0].averageDispatchMinutes, 8);
  assert.equal(result.stats[0].assignmentActions, 1);
  assert.equal(result.summary.ordersDispatched, 1);
  assert.equal(result.summary.averageDispatchMinutes, 8);
  assert.equal(result.summary.assignmentActions, 1);
  assert.equal(result.coverage.totalOrders, 2);
  assert.equal(result.coverage.allOrdersInRange, 3);
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].orderNumber, 203);
  assert.equal(
    result.sourceBreakdown.find((source) => source.sourceGroup === "ONLINE")
      .totalOrders,
    1
  );
  assert.equal(
    result.sourceBreakdown.find((source) => source.sourceGroup === "APP")
      .totalOrders,
    0
  );
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

test("dispatch delay filter accepts boolean POST values and GET strings without truthy coercion", () => {
  for (const value of [undefined, false, "false"]) {
    assert.equal(readDispatcherPerformanceOverFiveMinutesOnly(value), false);
  }
  for (const value of [true, "true"]) {
    assert.equal(readDispatcherPerformanceOverFiveMinutesOnly(value), true);
  }
  for (const value of [null, 0, 1, "yes", "", [], ["true"], {}]) {
    assert.throws(() => readDispatcherPerformanceOverFiveMinutesOnly(value), /true or false/);
  }
});

test("over-five-minute filter uses exact timestamps and excludes missing or invalid timing", () => {
  const orders = [
    ["fast", "2026-09-10T16:04:59.999Z"],
    ["exactly-five", "2026-09-10T16:05:00.000Z"],
    ["just-over-five", "2026-09-10T16:05:00.001Z"],
    ["slow", "2026-09-10T16:10:00.000Z"],
    ["negative", "2026-09-10T15:59:00.000Z"],
    ["missing", null],
    ["invalid", "invalid date"]
  ].map(([id, timestamp], index) => order({
    id,
    orderNumber: index + 1,
    dispatchedAt: timestamp === null ? null : at(timestamp)
  }));
  const input = { dispatchers, orders, events: [] };
  const result = buildDispatcherPerformance({ ...input, overFiveMinutesOnly: true });

  assert.deepEqual(result.orders.map((item) => item.orderId), ["just-over-five", "slow"]);
  assert.equal(result.overFiveMinutesOnly, true);
  assert.equal(result.summary.ordersDispatched, 2);
  assert.equal(result.summary.averageDispatchMinutes, 7.5);
  assert.equal(result.summary.withinFiveMinutesPercent, 0);
  assert.equal(result.coverage.totalOrders, orders.length);
  assert.deepEqual(
    buildDispatcherPerformance({ ...input, overFiveMinutesOnly: false }),
    buildDispatcherPerformance(input)
  );
});

test("delay filter combines with dispatcher/source filters across metrics, events, and evidence", () => {
  const slow = (id, overrides = {}) => order({
    id, orderNumber: 1,
    orderSource: OrderSource.DISPATCHER_MANUAL,
    createdByUserId: "dispatcher-1",
    manualEntryStartedAt: at("2026-09-10T15:58:00.000Z"),
    dispatchedAt: at("2026-09-10T16:08:00.000Z"),
    ...overrides
  });
  const orders = [
    slow("manual-slow"),
    slow("manual-fast", { dispatchedAt: at("2026-09-10T16:02:00.000Z") }),
    slow("app-slow", { orderSource: OrderSource.IOS_APP }),
    slow("other-dispatcher", { createdByUserId: "admin-1", dispatchedByUserId: "admin-1" })
  ];
  const events = orders.map((item) => ({
    orderId: item.id,
    eventType: DispatchEventType.REASSIGNED,
    dispatchSource: DispatchSource.MANUAL,
    actorUserId: item.dispatchedByUserId,
    occurredAt: at("2026-09-10T16:20:00.000Z")
  }));
  const result = buildDispatcherPerformance({
    dispatchers, orders, events,
    selectedDispatcherIds: ["dispatcher-1"],
    selectedSourceGroups: ["MANUAL"],
    overFiveMinutesOnly: true
  });

  assert.deepEqual(result.orders.map((item) => item.orderId), ["manual-slow"]);
  assert.equal(result.summary.ordersDispatched, 1);
  assert.equal(result.summary.manualOrdersCreated, 1);
  assert.equal(result.summary.averageManualEntryMinutes, 2);
  assert.equal(result.summary.averageDispatchMinutes, 8);
  assert.equal(result.summary.averageTotalDeliveryMinutes, 30);
  assert.equal(result.summary.assignmentActions, 1);
  assert.equal(result.summary.reassignments, 1);
  assert.equal(result.stats.length, 1);
  assert.equal(result.stats[0].ordersDispatched, 1);
  assert.equal(result.stats[0].manualOrdersCreated, 1);
  assert.equal(result.stats[0].assignmentActions, 1);
  assert.equal(result.sourceBreakdown.find((source) => source.sourceGroup === "MANUAL").totalOrders, 1);
  assert.equal(result.sourceBreakdown.find((source) => source.sourceGroup === "APP").totalOrders, 0);
  assert.equal(result.dailyTrend.length, 1);
  assert.equal(result.dailyTrend[0].totalOrders, 1);
  assert.equal(result.dailyTrend[0].averageDispatchMinutes, 8);

  const empty = buildDispatcherPerformance({
    dispatchers, orders, events,
    selectedSourceGroups: ["ONLINE"],
    overFiveMinutesOnly: true
  });
  assert.deepEqual(empty.orders, []);
  assert.equal(empty.summary.ordersDispatched, 0);
  assert.equal(empty.summary.averageDispatchMinutes, null);
  assert.equal(empty.summary.assignmentActions, 0);
});

test("delay filter retains slow first dispatches after unassignment and ignores later assignment timing", () => {
  const orders = [
    order({ id: "unassigned-slow", orderNumber: 1, dispatchedAt: null, dispatchSource: null, dispatchedByUserId: null }),
    order({ id: "reassigned-fast", orderNumber: 2, dispatchedAt: at("2026-09-10T16:20:00.000Z") }),
    order({ id: "auto-first", orderNumber: 3, dispatchedAt: at("2026-09-10T16:20:00.000Z") })
  ];
  const assigned = (orderId, timestamp, dispatchSource = DispatchSource.MANUAL) => ({
    orderId, eventType: DispatchEventType.ASSIGNED,
    dispatchSource, actorUserId: dispatchSource === DispatchSource.AUTO ? null : "dispatcher-1",
    occurredAt: at(timestamp)
  });
  const events = [
    assigned("unassigned-slow", "2026-09-10T16:08:00.000Z"),
    assigned("reassigned-fast", "2026-09-10T16:20:00.000Z"),
    assigned("reassigned-fast", "2026-09-10T16:02:00.000Z"),
    assigned("auto-first", "2026-09-10T16:10:00.000Z", DispatchSource.AUTO)
  ];
  const result = buildDispatcherPerformance({ dispatchers, orders, events, overFiveMinutesOnly: true });
  assert.deepEqual(result.orders.map((item) => item.orderId), ["unassigned-slow"]);
  assert.equal(result.orders[0].dispatchMinutes, 8);
  assert.equal(result.summary.assignmentActions, 1);
});

test("performance endpoint applies the delay filter from POST bodies and GET queries", async (t) => {
  const { prisma } = require("../dist/lib/prisma.js");
  const replaceFindMany = (model, replacement) => {
    const original = model.findMany;
    model.findMany = replacement;
    t.after(() => { model.findMany = original; });
  };
  replaceFindMany(prisma.user, async () => dispatchers);
  replaceFindMany(prisma.order, async () => [
    order({ id: "fast", orderNumber: 1 }),
    order({ id: "slow", orderNumber: 2, dispatchedAt: at("2026-09-10T16:08:00.000Z") })
  ]);
  replaceFindMany(prisma.dispatchEvent, async () => []);
  for (const method of ["POST", "GET"]) {
    for (const enabled of [true, false]) {
      let response;
      const filters = {
        startDate: "2026-09-10", endDate: "2026-09-10",
        overFiveMinutesOnly: method === "POST" ? enabled : String(enabled)
      };
      await getDispatcherPerformanceController({ method, body: filters, query: filters }, {
        status(code) { assert.equal(code, 200); return this; },
        json(data) { response = data; }
      });
      assert.equal(response.overFiveMinutesOnly, enabled);
      assert.equal(response.orders.length, enabled ? 1 : 2);
    }
  }
});
