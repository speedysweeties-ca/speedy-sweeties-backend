import { Request, Response } from "express";
import { OrderStatus, Prisma, UserRole } from "@prisma/client";
import { messaging } from "../config/firebase";
import { prisma } from "../lib/prisma";
import {
  recordDeliveredOrderLoyalty,
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

const sendPushNotification = async (
  fcmToken: string | null,
  title: string,
  body: string,
  type: string
): Promise<void> => {
  if (!fcmToken) {
    console.log(`No customer FCM token found for ${type}`);
    return;
  }

  try {
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data: { type },
      android: {
        priority: "high",
        notification: {
          channelId: "speedy_sweeties_orders",
          sound: "default"
        }
      }
    });
  } catch (error) {
    console.error(`${type} push failed:`, error instanceof Error ? error.name : typeof error);
  }
};

export const driverActionController = async (
  req: Request<{ id: string }, {}, DriverActionBody>,
  res: Response
): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = req.params;
  const { action } = req.body;

  if (!user?.userId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const order = await prisma.order.findUnique({ where: { id } });

  if (!order) {
    res.status(404).json({ success: false, message: "Order not found" });
    return;
  }

  if (order.assignedDriverId !== user.userId) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const targetStatus =
    action === "ACCEPTED"
      ? OrderStatus.ACCEPTED
      : action === "OUT_FOR_DELIVERY"
        ? OrderStatus.OUT_FOR_DELIVERY
        : action === "DELIVERED"
          ? OrderStatus.DELIVERED
          : null;
  if (!targetStatus) {
    res.status(400).json({ success: false, message: "Invalid action" });
    return;
  }

  const requiresReceipt =
    targetStatus === OrderStatus.OUT_FOR_DELIVERY ||
    targetStatus === OrderStatus.DELIVERED;
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
      res.status(409).json({
        success: false,
        code: "INVALID_ORDER_TRANSITION",
        message: "Order changed before acceptance could be completed."
      });
      return;
    }

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
      res.status(409).json({
        success: false,
        code: "INVALID_ORDER_TRANSITION",
        message: "Order changed before pickup could be completed."
      });
      return;
    }

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: orderInclude
    });

      await sendPushNotification(
        order.fcmToken,
        "Speedy Sweeties 🚗",
        "Your order is now out for delivery!",
        "ORDER_OUT_FOR_DELIVERY"
      );

    res.status(200).json({
      success: true,
      message: "Order marked OUT_FOR_DELIVERY",
      order: updated
    });
    return;
  }

  if (action === "DELIVERED") {
    const deliveryUpdate = await prisma.order.updateMany({
      where: {
        id,
        assignedDriverId: user.userId,
        orderStatus: order.orderStatus
      },
      data: {
        orderStatus: OrderStatus.DELIVERED,
        ...buildOrderTransitionTimestampData(
          order,
          OrderStatus.DELIVERED,
          now
        ),
        ...getFirstDispatchAttribution(order.dispatchedAt, {
          userId: user.userId,
          role: UserRole.DRIVER
        })
      }
    });

    if (deliveryUpdate.count === 0) {
      res.status(409).json({
        success: false,
        code: "INVALID_ORDER_TRANSITION",
        message: "Order changed before delivery could be completed."
      });
      return;
    }

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: orderInclude
    });

    const loyaltyResult = await recordDeliveredOrderLoyalty(
      order.customerId,
      order.orderSource
    );
    await sendCustomerLoyaltyNotification(order.fcmToken, loyaltyResult);

    res.status(200).json({
      success: true,
      message: "Order marked DELIVERED",
      order: updated
    });
    return;
  }

};
