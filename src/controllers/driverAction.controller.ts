import { Request, Response } from "express";
import { PrismaClient, OrderStatus, Prisma } from "@prisma/client";
import admin from "firebase-admin";

const prisma = new PrismaClient();

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
  }
} satisfies Prisma.OrderInclude;

const hasAppFcmToken = (fcmToken: string | null | undefined): boolean => {
  return typeof fcmToken === "string" && fcmToken.trim().length > 0;
};

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
    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title,
        body
      },
      data: {
        type
      },
      android: {
        priority: "high",
        notification: {
          channelId: "speedy_sweeties_orders",
          sound: "default"
        }
      }
    });

    console.log(`${type} push sent`);
  } catch (error) {
    console.error(`${type} push failed:`, error);
  }
};

const applyCustomerLoyaltyForDeliveredOrder = async (
  customerId: string | null,
  fcmToken: string | null
): Promise<void> => {
  if (!customerId) {
    console.log("No customerId found for delivered order. Loyalty not updated.");
    return;
  }

  if (!hasAppFcmToken(fcmToken)) {
    console.log("Order has no app FCM token. Loyalty not updated.");
    return;
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      loyaltyCompletedOrders: true,
      loyaltyRewardsEarned: true,
      loyaltyFreeDelivery: true
    }
  });

  if (!customer) {
    console.log("Customer not found. Loyalty not updated.");
    return;
  }

  const nextCompletedOrders = customer.loyaltyCompletedOrders + 1;

  if (nextCompletedOrders >= 10) {
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        loyaltyCompletedOrders: 0,
        loyaltyRewardsEarned: {
          increment: 1
        },
        loyaltyFreeDelivery: true
      }
    });

    await sendPushNotification(
      fcmToken,
      "Speedy Sweeties 🎉",
      "You earned a free delivery on your next order!",
      "LOYALTY_REWARD_EARNED"
    );

    console.log("Customer earned a free delivery reward.");
    return;
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      loyaltyCompletedOrders: nextCompletedOrders
    }
  });

  const deliveriesRemaining = 10 - nextCompletedOrders;
  const deliveryWord = deliveriesRemaining === 1 ? "delivery" : "deliveries";

  await sendPushNotification(
    fcmToken,
    "Speedy Sweeties Rewards",
    `You only have ${deliveriesRemaining} ${deliveryWord} left for your next free delivery.`,
    "LOYALTY_PROGRESS_UPDATE"
  );

  console.log(`Customer loyalty updated: ${nextCompletedOrders}/10 completed deliveries.`);
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

  if (order.orderStatus === OrderStatus.CANCELLED) {
    res.status(400).json({ success: false, message: "Cancelled orders cannot be updated" });
    return;
  }

  if (order.orderStatus === OrderStatus.DELIVERED) {
    res.status(200).json({
      success: true,
      message: "Order already delivered",
      order
    });
    return;
  }

  const now = new Date();

  if (action === "ACCEPTED") {
    const canAccept =
      order.orderStatus === OrderStatus.PLACED ||
      order.orderStatus === OrderStatus.DISPATCHED ||
      order.orderStatus === OrderStatus.ACCEPTED;

    if (!canAccept) {
      res.status(400).json({
        success: false,
        message: "Order cannot be accepted from its current status"
      });
      return;
    }

    const updated = await prisma.order.update({
      where: { id },
      data: {
        orderStatus: OrderStatus.ACCEPTED,
        dispatchedAt: order.dispatchedAt ?? order.assignedAt ?? now,
        acceptedAt: order.acceptedAt ?? now
      },
      include: orderInclude
    });

    res.status(200).json({ success: true, message: "Order accepted", order: updated });
    return;
  }

  if (action === "OUT_FOR_DELIVERY") {
    const canMarkOutForDelivery =
      order.orderStatus === OrderStatus.PLACED ||
      order.orderStatus === OrderStatus.DISPATCHED ||
      order.orderStatus === OrderStatus.ACCEPTED ||
      order.orderStatus === OrderStatus.OUT_FOR_DELIVERY;

    if (!canMarkOutForDelivery) {
      res.status(400).json({
        success: false,
        message: "Order cannot be marked out for delivery from its current status"
      });
      return;
    }

    const updated = await prisma.order.update({
      where: { id },
      data: {
        orderStatus: OrderStatus.OUT_FOR_DELIVERY,
        dispatchedAt: order.dispatchedAt ?? order.assignedAt ?? now,
        acceptedAt: order.acceptedAt ?? now,
        outForDeliveryAt: order.outForDeliveryAt ?? now
      },
      include: orderInclude
    });

    if (order.orderStatus !== OrderStatus.OUT_FOR_DELIVERY) {
      await sendPushNotification(
        order.fcmToken,
        "Speedy Sweeties 🚗",
        "Your order is now out for delivery!",
        "ORDER_OUT_FOR_DELIVERY"
      );
    }

    res.status(200).json({
      success: true,
      message: "Order marked OUT_FOR_DELIVERY",
      order: updated
    });
    return;
  }

  if (action === "DELIVERED") {
    const canMarkDelivered =
      order.orderStatus === OrderStatus.PLACED ||
      order.orderStatus === OrderStatus.DISPATCHED ||
      order.orderStatus === OrderStatus.ACCEPTED ||
      order.orderStatus === OrderStatus.OUT_FOR_DELIVERY;

    if (!canMarkDelivered) {
      res.status(400).json({
        success: false,
        message: "Order cannot be marked delivered from its current status"
      });
      return;
    }

    const updated = await prisma.order.update({
      where: { id },
      data: {
        orderStatus: OrderStatus.DELIVERED,
        dispatchedAt: order.dispatchedAt ?? order.assignedAt ?? now,
        acceptedAt: order.acceptedAt ?? now,
        outForDeliveryAt: order.outForDeliveryAt ?? now,
        deliveredAt: order.deliveredAt ?? now
      },
      include: orderInclude
    });

    await applyCustomerLoyaltyForDeliveredOrder(
      order.customerId,
      order.fcmToken
    );

    res.status(200).json({
      success: true,
      message: "Order marked DELIVERED",
      order: updated
    });
    return;
  }

  res.status(400).json({ success: false, message: "Invalid action" });
};