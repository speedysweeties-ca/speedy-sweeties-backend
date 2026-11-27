import { logDiagnostic, setDiagnosticOrder } from "../utils/operationalDiagnostics";
import { Request, Response } from "express";
import { OrderStatus, Prisma, UserRole } from "@prisma/client";
import { sendCustomerOrderNotification } from "../services/customerOrderNotification.service";
import { prisma } from "../lib/prisma";
import {
  recordDeliveredOrderLoyaltyInTransaction,
  sendCustomerLoyaltyNotification
} from "../services/loyalty.service";
import { getFirstDispatchAttribution } from "../utils/dispatchAttribution";
import {
  buildOrderTransitionTimestampData,
  evaluateOrderStatusTransition
} from "../services/orderStateTransition.service";

type AuthenticatedUser = {
  userId: string;
  email: string;
  role: string;
};

type DriverActionBody = {
  action: "ACCEPTED" | "OUT_FOR_DELIVERY" | "DELIVERED";
};

const getAuthUser = (req: Request): AuthenticatedUser | undefined => {
  return (req as Request & { user?: AuthenticatedUser }).user;
};

const orderInclude = {
  items: true,
  assignedDriver: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true
    }
  },
  dispatchedBy: {
    select: {
      firstName: true,
      lastName: true
    }
  }
} satisfies Prisma.OrderInclude;

export const driverActionController = async (
  req: Request<{ id: string }, {}, DriverActionBody>,
  res: Response
): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = req.params;
  const { action } = req.body;
  const log = (outcome: string, reason?: string) => logDiagnostic({ event: "DRIVER_ACTION", action, outcome, reason });
  log("started");

  if (!user?.userId) {
    log("rejected", "UNAUTHORIZED");
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  if (action === "DELIVERED") {
    const result = await prisma.$transaction(async tx => {
      // Completion, concurrent retries, receipt saves and cancellation serialize here.
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
      const current = await tx.order.findUnique({ where: { id }, include: orderInclude });
      if (!current) return { kind: "notFound" as const };
      setDiagnosticOrder(current.orderNumber);
      if (current.assignedDriverId !== user.userId) return { kind: "forbidden" as const };
      if (current.orderStatus === OrderStatus.DELIVERED) {
        return { kind: "replayed" as const, order: current };
      }
      const receipt = await tx.digitalReceipt.findUnique({ where: { orderId: id }, select: { id: true } });
      const decision = evaluateOrderStatusTransition({
        actor: "DRIVER_ACTION", currentStatus: current.orderStatus,
        targetStatus: OrderStatus.DELIVERED, hasPersistedReceipt: receipt !== null
      });
      if ("code" in decision) return { kind: "conflict" as const, decision };
      const now = new Date();
      const updated = await tx.order.update({
        where: { id },
        data: {
          orderStatus: OrderStatus.DELIVERED,
          ...buildOrderTransitionTimestampData(current, OrderStatus.DELIVERED, now),
          ...getFirstDispatchAttribution(current.dispatchedAt, { userId: user.userId, role: UserRole.DRIVER })
        },
        include: orderInclude
      });
      const loyalty = await recordDeliveredOrderLoyaltyInTransaction(tx, current.customerId, current.orderSource, now);
      return { kind: "completed" as const, order: updated, loyalty };
    });
    if (result.kind === "notFound") {
      log("rejected", "ORDER_NOT_FOUND");
      res.status(404).json({ success: false, message: "Order not found" });
      return;
    }
    if (result.kind === "forbidden") {
      log("rejected", "FORBIDDEN");
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }
    if (result.kind === "conflict") {
      log("rejected", result.decision.code);
      res.status(409).json({ success: false, code: result.decision.code, message: result.decision.message });
      return;
    }
    log(result.kind === "completed" ? "committed" : "replayed");
    if (result.kind === "completed") {
      try {
        await sendCustomerLoyaltyNotification(id, result.loyalty);
      } catch {
        // Delivery is already committed; notification failure must not report it as failed.
        logDiagnostic({ event: "CUSTOMER_ORDER_PUSH", outcome: "failed", reason: "PREPARATION_FAILED" });
      }
    }
    res.status(200).json({
      success: true, message: "Order marked DELIVERED", order: result.order,
      alreadyCompleted: result.kind === "replayed"
    });
    return;
  }

  const order = await prisma.order.findUnique({ where: { id } });
  setDiagnosticOrder(order?.orderNumber);

  if (!order) {
    log("rejected", "ORDER_NOT_FOUND");
    res.status(404).json({ success: false, message: "Order not found" });
    return;
  }

  if (order.assignedDriverId !== user.userId) {
    log("rejected", "FORBIDDEN");
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const targetStatus =
    action === "ACCEPTED"
      ? OrderStatus.ACCEPTED
      : action === "OUT_FOR_DELIVERY"
        ? OrderStatus.OUT_FOR_DELIVERY
        : null;
  if (!targetStatus) {
    log("rejected", "INVALID_ACTION");
    res.status(400).json({ success: false, message: "Invalid action" });
    return;
  }

  const requiresReceipt =
    targetStatus === OrderStatus.OUT_FOR_DELIVERY;
  const receipt = requiresReceipt
    ? await prisma.digitalReceipt.findUnique({
        where: { orderId: id },
        select: { id: true }
      })
    : null;
  const transition = evaluateOrderStatusTransition({
    actor: "DRIVER_ACTION",
    currentStatus: order.orderStatus,
    targetStatus,
    hasPersistedReceipt: receipt !== null
  });
  if ("code" in transition) {
    log("rejected", transition.code);
    res.status(409).json({
      success: false,
      code: transition.code,
      message: transition.message
    });
    return;
  }

  const now = new Date();

  if (action === "ACCEPTED") {
    const acceptanceUpdate = await prisma.order.updateMany({
      where: {
        id,
        assignedDriverId: user.userId,
        orderStatus: order.orderStatus
      },
      data: {
        orderStatus: OrderStatus.ACCEPTED,
        ...buildOrderTransitionTimestampData(
          order,
          OrderStatus.ACCEPTED,
          now
        ),
        ...getFirstDispatchAttribution(order.dispatchedAt, {
          userId: user.userId,
          role: UserRole.DRIVER
        }),
      }
    });

    if (acceptanceUpdate.count === 0) {
      log("rejected", "ORDER_CHANGED");
      res.status(409).json({
        success: false,
        code: "INVALID_ORDER_TRANSITION",
        message: "Order changed before acceptance could be completed."
      });
      return;
    }

    log("committed");
    const updated = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: orderInclude
    });

    res.status(200).json({ success: true, message: "Order accepted", order: updated });
    return;
  }

  if (action === "OUT_FOR_DELIVERY") {
    const outForDeliveryUpdate = await prisma.order.updateMany({
      where: {
        id,
        assignedDriverId: user.userId,
        orderStatus: order.orderStatus
      },
      data: {
        orderStatus: OrderStatus.OUT_FOR_DELIVERY,
        ...buildOrderTransitionTimestampData(
          order,
          OrderStatus.OUT_FOR_DELIVERY,
          now
        ),
        ...getFirstDispatchAttribution(order.dispatchedAt, {
          userId: user.userId,
          role: UserRole.DRIVER
        })
      }
    });

    if (outForDeliveryUpdate.count === 0) {
      log("rejected", "ORDER_CHANGED");
      res.status(409).json({
        success: false,
        code: "INVALID_ORDER_TRANSITION",
        message: "Order changed before pickup could be completed."
      });
      return;
    }

    log("committed");
    const updated = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: orderInclude
    });

      await sendCustomerOrderNotification(id, "ORDER_OUT_FOR_DELIVERY");

    res.status(200).json({
      success: true,
      message: "Order marked OUT_FOR_DELIVERY",
      order: updated
    });
    return;
  }


};
