const assert = require("node:assert/strict");
const test = require("node:test");
const { OrderStatus } = require("@prisma/client");

const {
  buildOrderTransitionTimestampData,
  evaluateOrderStatusTransition,
  INITIAL_ORDER_STATUS
} = require("../dist/services/orderStateTransition.service.js");

const decision = (actor, currentStatus, targetStatus, hasPersistedReceipt = false) =>
  evaluateOrderStatusTransition({
    actor,
    currentStatus,
    targetStatus,
    hasPersistedReceipt
  });

const snapshot = (overrides = {}) => ({
  assignedAt: new Date("2026-09-09T12:00:00.000Z"),
  dispatchedAt: null,
  acceptedAt: null,
  outForDeliveryAt: null,
  deliveredAt: null,
  ...overrides
});

test("orders start in the centralized PLACED state", () => {
  assert.equal(INITIAL_ORDER_STATUS, OrderStatus.PLACED);
});

test("permits the operational transitions owned by their approved workflows", () => {
  assert.equal(
    decision("AUTO_DISPATCH", OrderStatus.PLACED, OrderStatus.DISPATCHED).allowed,
    true
  );
  assert.equal(
    decision("MANUAL_ASSIGNMENT", OrderStatus.PLACED, OrderStatus.DISPATCHED)
      .allowed,
    true
  );
  assert.equal(
    decision("MANUAL_UNASSIGNMENT", OrderStatus.DISPATCHED, OrderStatus.PLACED)
      .allowed,
    true
  );
  assert.equal(
    decision("DRIVER_ACTION", OrderStatus.PLACED, OrderStatus.ACCEPTED).allowed,
    true
  );
  assert.equal(
    decision("DRIVER_ACTION", OrderStatus.DISPATCHED, OrderStatus.ACCEPTED)
      .allowed,
    true
  );
  assert.equal(
    decision("RECEIPT", OrderStatus.ACCEPTED, OrderStatus.OUT_FOR_DELIVERY, true)
      .allowed,
    true
  );
  assert.equal(
    decision(
      "DRIVER_ACTION",
      OrderStatus.ACCEPTED,
      OrderStatus.OUT_FOR_DELIVERY,
      true
    ).allowed,
    true
  );
  assert.equal(
    decision(
      "DRIVER_ACTION",
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
      true
    ).allowed,
    true
  );
});

test("rejects every actor and status pair outside the documented transition matrix", () => {
  const permitted = new Set([
    "AUTO_DISPATCH:PLACED:DISPATCHED",
    "MANUAL_ASSIGNMENT:PLACED:DISPATCHED",
    "MANUAL_UNASSIGNMENT:DISPATCHED:PLACED",
    "DRIVER_ACTION:PLACED:ACCEPTED",
    "DRIVER_ACTION:DISPATCHED:ACCEPTED",
    "DRIVER_ACTION:ACCEPTED:OUT_FOR_DELIVERY",
    "DRIVER_ACTION:OUT_FOR_DELIVERY:DELIVERED",
    "RECEIPT:ACCEPTED:OUT_FOR_DELIVERY",
    "STAFF_CANCELLATION:PLACED:CANCELLED",
    "STAFF_CANCELLATION:DISPATCHED:CANCELLED",
    "STAFF_CANCELLATION:ACCEPTED:CANCELLED",
    "STAFF_CANCELLATION:OUT_FOR_DELIVERY:CANCELLED"
  ]);
  const actors = [
    "AUTO_DISPATCH",
    "MANUAL_ASSIGNMENT",
    "MANUAL_UNASSIGNMENT",
    "DRIVER_ACTION",
    "RECEIPT",
    "STAFF_CANCELLATION"
  ];
  const statuses = Object.values(OrderStatus);

  actors.forEach((actor) => {
    statuses.forEach((currentStatus) => {
      statuses.forEach((targetStatus) => {
        const key = `${actor}:${currentStatus}:${targetStatus}`;
        const result = decision(actor, currentStatus, targetStatus, true);
        assert.equal(
          result.allowed,
          permitted.has(key),
          `unexpected transition policy for ${key}`
        );
      });
    });
  });
});

test("rejects skipped and actor-incompatible operational transitions", () => {
  const forbidden = [
    ["DRIVER_ACTION", OrderStatus.PLACED, OrderStatus.DELIVERED],
    ["DRIVER_ACTION", OrderStatus.DISPATCHED, OrderStatus.OUT_FOR_DELIVERY],
    ["DRIVER_ACTION", OrderStatus.ACCEPTED, OrderStatus.DELIVERED],
    ["STAFF_CANCELLATION", OrderStatus.PLACED, OrderStatus.ACCEPTED],
    ["AUTO_DISPATCH", OrderStatus.DISPATCHED, OrderStatus.ACCEPTED],
    ["MANUAL_ASSIGNMENT", OrderStatus.ACCEPTED, OrderStatus.DISPATCHED]
  ];

  forbidden.forEach(([actor, currentStatus, targetStatus]) => {
    const result = decision(actor, currentStatus, targetStatus, true);
    assert.equal(result.allowed, false);
    assert.equal(result.code, "INVALID_ORDER_TRANSITION");
  });
});

test("requires a persisted receipt before pickup or delivery completion", () => {
  const pickup = decision(
    "DRIVER_ACTION",
    OrderStatus.ACCEPTED,
    OrderStatus.OUT_FOR_DELIVERY
  );
  const delivered = decision(
    "DRIVER_ACTION",
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.DELIVERED
  );

  assert.equal(pickup.allowed, false);
  assert.equal(pickup.code, "RECEIPT_REQUIRED");
  assert.equal(delivered.allowed, false);
  assert.equal(delivered.code, "RECEIPT_REQUIRED");
});

test("permits staff cancellation only from non-terminal operational stages", () => {
  [
    OrderStatus.PLACED,
    OrderStatus.DISPATCHED,
    OrderStatus.ACCEPTED,
    OrderStatus.OUT_FOR_DELIVERY
  ].forEach((currentStatus) => {
    assert.equal(
      decision("STAFF_CANCELLATION", currentStatus, OrderStatus.CANCELLED)
        .allowed,
      true
    );
  });
});

test("terminal statuses reject repeat transitions and delivered cancellation", () => {
  [OrderStatus.DELIVERED, OrderStatus.CANCELLED].forEach((currentStatus) => {
    const result = decision(
      "DRIVER_ACTION",
      currentStatus,
      OrderStatus.DELIVERED,
      true
    );
    assert.equal(result.allowed, false);
    assert.equal(result.code, "INVALID_ORDER_TRANSITION");
  });

  const cancellation = decision(
    "STAFF_CANCELLATION",
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED
  );
  assert.equal(cancellation.allowed, false);
  assert.equal(cancellation.code, "INVALID_ORDER_TRANSITION");
});

test("transition timestamp data is written once and preserves prior lifecycle timestamps", () => {
  const now = new Date("2026-09-09T13:00:00.000Z");
  const acceptedAt = new Date("2026-09-09T12:10:00.000Z");
  const dispatchedAt = new Date("2026-09-09T12:05:00.000Z");
  const outForDeliveryAt = new Date("2026-09-09T12:20:00.000Z");
  const deliveredAt = new Date("2026-09-09T12:30:00.000Z");

  assert.deepEqual(
    buildOrderTransitionTimestampData(snapshot(), OrderStatus.ACCEPTED, now),
    { dispatchedAt: snapshot().assignedAt, acceptedAt: now }
  );
  assert.deepEqual(
    buildOrderTransitionTimestampData(
      snapshot({ dispatchedAt, acceptedAt }),
      OrderStatus.OUT_FOR_DELIVERY,
      now
    ),
    { dispatchedAt, acceptedAt, outForDeliveryAt: now }
  );
  assert.deepEqual(
    buildOrderTransitionTimestampData(
      snapshot({ dispatchedAt, acceptedAt, outForDeliveryAt, deliveredAt }),
      OrderStatus.DELIVERED,
      now
    ),
    { dispatchedAt, acceptedAt, outForDeliveryAt, deliveredAt }
  );
});