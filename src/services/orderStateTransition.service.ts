import { OrderStatus, Prisma } from "@prisma/client";

export const INITIAL_ORDER_STATUS = OrderStatus.PLACED;

export type OrderTransitionActor =
  | "AUTO_DISPATCH"
  | "MANUAL_ASSIGNMENT"
  | "MANUAL_UNASSIGNMENT"
  | "DRIVER_ACTION"
  | "RECEIPT"
  | "STAFF_CANCELLATION";

export type OrderTransitionFailureCode =
  | "INVALID_ORDER_TRANSITION"
  | "RECEIPT_REQUIRED";

export type OrderTransitionDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: OrderTransitionFailureCode;
      message: string;
    };

export type OrderLifecycleSnapshot = {
  assignedAt: Date | null;
  dispatchedAt: Date | null;
  acceptedAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
};

const operationalStatuses = new Set<OrderStatus>([
  OrderStatus.PLACED,
  OrderStatus.DISPATCHED,
  OrderStatus.ACCEPTED,
  OrderStatus.OUT_FOR_DELIVERY
]);

const invalidTransition = (
  currentStatus: OrderStatus,
  targetStatus: OrderStatus
): OrderTransitionDecision => ({
  allowed: false,
  code: "INVALID_ORDER_TRANSITION",
  message: `Order cannot transition from ${currentStatus} to ${targetStatus}.`
});

export const evaluateOrderStatusTransition = (input: {
  actor: OrderTransitionActor;
  currentStatus: OrderStatus;
  targetStatus: OrderStatus;
  hasPersistedReceipt?: boolean;
}): OrderTransitionDecision => {
  const {
    actor,
    currentStatus,
    targetStatus,
    hasPersistedReceipt = false
  } = input;

  if (
    currentStatus === OrderStatus.DELIVERED ||
    currentStatus === OrderStatus.CANCELLED ||
    currentStatus === targetStatus
  ) {
    return invalidTransition(currentStatus, targetStatus);
  }

  if (actor === "STAFF_CANCELLATION") {
    return targetStatus === OrderStatus.CANCELLED &&
      operationalStatuses.has(currentStatus)
      ? { allowed: true }
      : invalidTransition(currentStatus, targetStatus);
  }

  if (actor === "AUTO_DISPATCH" || actor === "MANUAL_ASSIGNMENT") {
    return currentStatus === OrderStatus.PLACED &&
      targetStatus === OrderStatus.DISPATCHED
      ? { allowed: true }
      : invalidTransition(currentStatus, targetStatus);
  }

  if (actor === "MANUAL_UNASSIGNMENT") {
    return currentStatus === OrderStatus.DISPATCHED &&
      targetStatus === OrderStatus.PLACED
      ? { allowed: true }
      : invalidTransition(currentStatus, targetStatus);
  }

  if (
    (actor === "DRIVER_ACTION" || actor === "RECEIPT") &&
    currentStatus === OrderStatus.ACCEPTED &&
    targetStatus === OrderStatus.OUT_FOR_DELIVERY
  ) {
    return hasPersistedReceipt
      ? { allowed: true }
      : {
          allowed: false,
          code: "RECEIPT_REQUIRED",
          message: "A valid digital receipt is required before pickup."
        };
  }

  if (
    actor === "DRIVER_ACTION" &&
    (currentStatus === OrderStatus.PLACED ||
      currentStatus === OrderStatus.DISPATCHED) &&
    targetStatus === OrderStatus.ACCEPTED
  ) {
    return { allowed: true };
  }

  if (
    actor === "DRIVER_ACTION" &&
    currentStatus === OrderStatus.OUT_FOR_DELIVERY &&
    targetStatus === OrderStatus.DELIVERED
  ) {
    return hasPersistedReceipt
      ? { allowed: true }
      : {
          allowed: false,
          code: "RECEIPT_REQUIRED",
          message: "A valid digital receipt is required before delivery completion."
        };
  }

  return invalidTransition(currentStatus, targetStatus);
};

export const buildOrderTransitionTimestampData = (
  currentOrder: OrderLifecycleSnapshot,
  targetStatus: OrderStatus,
  now: Date
): Prisma.OrderUncheckedUpdateManyInput => {
  if (targetStatus === OrderStatus.DISPATCHED) {
    return {
      dispatchedAt: currentOrder.dispatchedAt ?? now
    };
  }

  if (targetStatus === OrderStatus.ACCEPTED) {
    return {
      dispatchedAt:
        currentOrder.dispatchedAt ?? currentOrder.assignedAt ?? now,
      acceptedAt: currentOrder.acceptedAt ?? now
    };
  }

  if (targetStatus === OrderStatus.OUT_FOR_DELIVERY) {
    return {
      dispatchedAt:
        currentOrder.dispatchedAt ?? currentOrder.assignedAt ?? now,
      acceptedAt: currentOrder.acceptedAt ?? now,
      outForDeliveryAt: currentOrder.outForDeliveryAt ?? now
    };
  }

  if (targetStatus === OrderStatus.DELIVERED) {
    return {
      dispatchedAt:
        currentOrder.dispatchedAt ?? currentOrder.assignedAt ?? now,
      acceptedAt: currentOrder.acceptedAt ?? now,
      outForDeliveryAt: currentOrder.outForDeliveryAt ?? now,
      deliveredAt: currentOrder.deliveredAt ?? now
    };
  }

  return {};
};