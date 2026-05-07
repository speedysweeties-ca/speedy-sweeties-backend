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

const applyCustomerLoyaltyForDeliveredOrder = async (
  customerId: string | null
): Promise<void> => {
  if (!customerId) {
    console.log("No customerId found for delivered order. Loyalty not updated.");
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

    console.log("Customer earned a free delivery reward.");
    return;
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      loyaltyCompletedOrders: nextCompletedOrders
    }
  });

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

  if (action === "ACCEPTED") {
    if (order.orderStatus !== OrderStatus.PLACED) {
      res.status(400).json({ success: false, message: "Order must be PLACED first" });
      return;
    }

    const updated = await prisma.order.update({
      where: { id },
      data: {
        orderStatus: OrderStatus.ACCEPTED,
        acceptedAt: order.acceptedAt ?? new Date()
      },
      include: orderInclude
    });

    res.status(200).json({ success: true, message: "Order accepted", order: updated });
    return;
  }

  if (action === "OUT_FOR_DELIVERY") {
    if (order.orderStatus !== OrderStatus.ACCEPTED) {
      res.status(400).json({ success: false, message: "Order must be ACCEPTED first" });
      return;
    }

    const updated = await prisma.order.update({
      where: { id },
      data: {
        orderStatus: OrderStatus.OUT_FOR_DELIVERY,
        outForDeliveryAt: order.outForDeliveryAt ?? new Date()
      },
      include: orderInclude
    });

    if (order.fcmToken) {
      try {
        await admin.messaging().send({
          token: order.fcmToken,
          notification: {
            title: "Speedy Sweeties 🚗",
            body: "Your order is now out for delivery!"
          }
        });

        console.log("Push sent to order customer");
      } catch (error) {
        console.error("Push failed:", error);
      }
    } else {
      console.log("No FCM token on this order");
    }

    res.status(200).json({
      success: true,
      message: "Order marked OUT_FOR_DELIVERY",
      order: updated
    });
    return;
  }

  if (action === "DELIVERED") {
    if (order.orderStatus !== OrderStatus.OUT_FOR_DELIVERY) {
      res.status(400).json({ success: false, message: "Order must be OUT_FOR_DELIVERY first" });
      return;
    }

    const updated = await prisma.order.update({
      where: { id },
      data: {
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: order.deliveredAt ?? new Date()
      },
      include: orderInclude
    });

    await applyCustomerLoyaltyForDeliveredOrder(order.customerId);

    res.status(200).json({
      success: true,
      message: "Order marked DELIVERED",
      order: updated
    });
    return;
  }

  res.status(400).json({ success: false, message: "Invalid action" });
};