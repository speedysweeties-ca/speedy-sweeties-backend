const assert = require("node:assert/strict");
const test = require("node:test");
const { OrderStatus, PaymentMethod } = require("@prisma/client");
const {
  buildGrowthDashboardDateRange,
  buildGrowthPeriodMetrics,
  buildLiveGrowthSnapshot,
  torontoDateStartUtc
} = require("../dist/services/growthDashboard.service.js");

const createOrder = (overrides) => ({
  id: overrides.id,
  customerId: null,
  paymentMethod: PaymentMethod.CASH,
  orderStatus: OrderStatus.PLACED,
  createdAt: new Date("2026-03-05T17:00:00.000Z"),
  dispatchedAt: null,
  deliveredAt: null,
  digitalReceipt: null,
  ...overrides
});

test("Toronto date boundaries account for daylight-saving time", () => {
  assert.equal(
    torontoDateStartUtc("2026-03-01").toISOString(),
    "2026-03-01T05:00:00.000Z"
  );
  assert.equal(
    torontoDateStartUtc("2026-04-01").toISOString(),
    "2026-04-01T04:00:00.000Z"
  );

  const range = buildGrowthDashboardDateRange("2026-03-01", "2026-03-31");
  assert.equal(range.days, 31);
  assert.equal(range.startUtc.toISOString(), "2026-03-01T05:00:00.000Z");
  assert.equal(range.endExclusiveUtc.toISOString(), "2026-04-01T04:00:00.000Z");
});

test("growth date ranges reject invalid or excessive selections", () => {
  assert.throws(
    () => buildGrowthDashboardDateRange("2026-03-10", "2026-03-01"),
    /Start date must be on or before end date/
  );
  assert.throws(
    () => buildGrowthDashboardDateRange("2026-02-30", "2026-03-01"),
    /selected date is invalid/
  );
  assert.throws(
    () => buildGrowthDashboardDateRange("2025-01-01", "2026-03-01"),
    /cannot exceed 366 days/
  );
});

test("growth metrics reconcile customers, quality, and receipt coverage", () => {
  const range = buildGrowthDashboardDateRange("2026-03-01", "2026-03-31");
  const orders = [
    createOrder({
      id: "delivered-new",
      customerId: "customer-new",
      orderStatus: OrderStatus.DELIVERED,
      createdAt: new Date("2026-03-05T17:00:00.000Z"),
      dispatchedAt: new Date("2026-03-05T17:04:00.000Z"),
      deliveredAt: new Date("2026-03-05T17:30:00.000Z"),
      digitalReceipt: { deliveryCharge: "10.64", grandTotal: "50.00" }
    }),
    createOrder({
      id: "delivered-returning",
      customerId: "customer-returning",
      paymentMethod: PaymentMethod.DEBIT,
      orderStatus: OrderStatus.DELIVERED,
      createdAt: new Date("2026-03-06T18:00:00.000Z"),
      dispatchedAt: new Date("2026-03-06T18:06:00.000Z"),
      deliveredAt: new Date("2026-03-06T18:50:00.000Z"),
      digitalReceipt: { deliveryCharge: 12, grandTotal: 60 }
    }),
    createOrder({
      id: "cancelled",
      orderStatus: OrderStatus.CANCELLED,
      createdAt: new Date("2026-03-07T19:00:00.000Z")
    }),
    createOrder({
      id: "active",
      orderStatus: OrderStatus.PLACED,
      createdAt: new Date("2026-03-08T20:00:00.000Z")
    })
  ];
  const firstDeliveredAtByCustomer = new Map([
    ["customer-new", new Date("2026-03-05T17:00:00.000Z")],
    ["customer-returning", new Date("2026-01-10T17:00:00.000Z")]
  ]);

  const result = buildGrowthPeriodMetrics(
    orders,
    range,
    firstDeliveredAtByCustomer
  );

  assert.equal(result.totalOrders, 4);
  assert.equal(result.deliveredOrders, 2);
  assert.equal(result.cancelledOrders, 1);
  assert.equal(result.activeOrders, 1);
  assert.equal(result.newCustomers, 1);
  assert.equal(result.returningCustomers, 1);
  assert.equal(result.returningCustomerRate, 50);
  assert.equal(result.completionRate, 66.7);
  assert.equal(result.cancellationRate, 33.3);
  assert.equal(result.averageMinutesToDispatch, 5);
  assert.equal(result.dispatchesOverFiveMinutesRate, 50);
  assert.equal(result.averageMinutesCreatedToDelivered, 40);
  assert.equal(result.deliveriesUnderFortyMinutesRate, 50);
  assert.equal(result.deliveryFeesRecorded, 22.64);
  assert.equal(result.receiptSalesTotal, 110);
  assert.deepEqual(result.dataCoverage, {
    customerLinkRate: 100,
    receiptRate: 100,
    dispatchTimestampRate: 100,
    deliveryTimeRate: 100
  });
  assert.equal(
    result.daily.reduce((sum, day) => sum + day.totalOrders, 0),
    result.totalOrders
  );
  assert.equal(
    result.weekdays.reduce((sum, day) => sum + day.totalOrders, 0),
    result.totalOrders
  );
  assert.equal(
    result.hours.reduce((sum, hour) => sum + hour.totalOrders, 0),
    result.totalOrders
  );
});

test("live snapshot identifies unattended and overdue orders", () => {
  const now = new Date("2026-03-08T20:45:00.000Z");
  const result = buildLiveGrowthSnapshot(
    [
      createOrder({
        id: "waiting",
        createdAt: new Date("2026-03-08T20:39:00.000Z")
      }),
      createOrder({
        id: "overdue",
        orderStatus: OrderStatus.ACCEPTED,
        createdAt: new Date("2026-03-08T19:55:00.000Z"),
        dispatchedAt: new Date("2026-03-08T19:57:00.000Z")
      }),
      createOrder({
        id: "accepted-without-dispatch-timestamp",
        orderStatus: OrderStatus.ACCEPTED,
        createdAt: new Date("2026-03-08T20:30:00.000Z")
      }),
      createOrder({
        id: "done",
        orderStatus: OrderStatus.DELIVERED,
        createdAt: new Date("2026-03-08T18:00:00.000Z"),
        deliveredAt: new Date("2026-03-08T18:30:00.000Z")
      })
    ],
    now
  );

  assert.deepEqual(result, {
    activeOrders: 3,
    waitingOverFiveMinutes: 1,
    runningOverFortyMinutes: 1
  });
});
