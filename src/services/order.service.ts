import { OrderStatus } from "@prisma/client";

export async function createOrder(): Promise<never> {
  throw new Error("Legacy createOrder service is not used.");
}

export async function getOrderById(): Promise<never> {
  throw new Error("Legacy getOrderById service is not used.");
}

export async function listOrders(): Promise<never> {
  throw new Error("Legacy listOrders service is not used.");
}

export async function updateOrderStatus(): Promise<never> {
  throw new Error("Legacy updateOrderStatus service is not used.");
}

export function validateStatusTransition(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus
): void {
  const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
    PLACED: ["ACCEPTED", "CANCELLED"],
    ACCEPTED: ["OUT_FOR_DELIVERY", "CANCELLED"],
    OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
    DELIVERED: [],
    CANCELLED: []
  };

  if (currentStatus === nextStatus) return;

  const allowed = allowedTransitions[currentStatus];

  if (!allowed.includes(nextStatus)) {
    throw new Error(`Invalid status transition from ${currentStatus} to ${nextStatus}`);
  }
}