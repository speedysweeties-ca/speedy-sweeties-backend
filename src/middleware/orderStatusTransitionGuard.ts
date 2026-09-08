import { NextFunction, Request, Response } from "express";
import { OrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PLACED]: [OrderStatus.DISPATCHED, OrderStatus.CANCELLED],
  [OrderStatus.DISPATCHED]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: []
};

export const isAllowedOrderStatusTransition = (
  currentStatus: OrderStatus,
  requestedStatus: OrderStatus
): boolean =>
  currentStatus === requestedStatus ||
  ALLOWED_TRANSITIONS[currentStatus].includes(requestedStatus);

export const requireAllowedOrderStatusTransition = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const requestedStatus = req.body?.orderStatus as OrderStatus | undefined;

  if (!id || !requestedStatus) {
    next();
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id },
    select: { orderStatus: true }
  });

  if (!order) {
    res.status(404).json({
      success: false,
      message: "Order not found"
    });
    return;
  }

  if (!isAllowedOrderStatusTransition(order.orderStatus, requestedStatus)) {
    res.status(409).json({
      success: false,
      code: "INVALID_ORDER_STATUS_TRANSITION",
      message: `Order cannot move from ${order.orderStatus} to ${requestedStatus}.`
    });
    return;
  }

  next();
};
