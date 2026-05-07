import {
  PrismaClient,
  UserRole,
  OrderStatus,
  OrderPriority
} from "@prisma/client";
import { Request, Response } from "express";
import admin from "../config/firebase";

const prisma = new PrismaClient();

type AssignDriverParams = {
  id: string;
};

type AssignDriverBody = {
  driverId: string | null;
  priority?: OrderPriority;
};

const shouldSendDriverPush = (driver: {
  isOnline: boolean;
  driverFcmToken: string | null;
  driverAppState: string | null;
}): boolean => {
  if (!driver.isOnline) return false;
  if (!driver.driverFcmToken) return false;

  return driver.driverAppState !== "FOREGROUND";
};

const sendDriverAssignedOrderPush = async (
  driverFcmToken: string,
  orderNumber: number,
  customerName: string,
  addressLine1: string,
  city?: string | null
): Promise<void> => {
  const address = [addressLine1, city].filter(Boolean).join(", ");

  try {
    await admin.messaging().send({
      token: driverFcmToken,
      notification: {
        title: "New Speedy Sweeties Order",
        body: `Order #${orderNumber} assigned to you. ${customerName} - ${address}`
      },
      data: {
        type: "DRIVER_ORDER_ASSIGNED",
        orderNumber: String(orderNumber)
      },
      android: {
        priority: "high",
        notification: {
          channelId: "speedy_sweeties_driver_orders",
          sound: "default"
        }
      }
    });

    console.log("Driver assigned order push sent");
  } catch (error) {
    console.error("Failed to send driver assigned order push:", error);
  }
};

export const assignDriverToOrderController = async (
  req: Request<AssignDriverParams, {}, AssignDriverBody>,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { driverId, priority } = req.body;

  const existingOrder = await prisma.order.findUnique({
    where: { id },
    include: {
      assignedDriver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  });

  if (!existingOrder) {
    res.status(404).json({
      success: false,
      message: "Order not found"
    });
    return;
  }

  if (
    existingOrder.orderStatus === OrderStatus.DELIVERED ||
    existingOrder.orderStatus === OrderStatus.CANCELLED
  ) {
    res.status(400).json({
      success: false,
      message: "Cannot assign a driver to a delivered or cancelled order"
    });
    return;
  }

  if (driverId === null) {
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        assignedDriverId: null,
        assignedAt: null,
        ...(priority ? { priority } : {})
      },
      include: {
        items: true,
        assignedDriver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    res.status(200).json({
      success: true,
      message: "Driver unassigned successfully",
      order: updatedOrder
    });
    return;
  }

  const driver = await prisma.user.findFirst({
    where: {
      id: driverId,
      role: UserRole.DRIVER,
      isActive: true
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isActive: true,
      isOnline: true,
      driverFcmToken: true,
      driverAppState: true
    }
  });

  if (!driver) {
    res.status(404).json({
      success: false,
      message: "Active driver not found"
    });
    return;
  }

  const wasAssignedToDifferentDriver = existingOrder.assignedDriverId !== driver.id;

  const updatedOrder = await prisma.order.update({
    where: { id },
    data: {
      assignedDriverId: driver.id,
      assignedAt: new Date(),
      ...(priority ? { priority } : {})
    },
    include: {
      items: true,
      assignedDriver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  });

  if (
    wasAssignedToDifferentDriver &&
    shouldSendDriverPush(driver) &&
    driver.driverFcmToken
  ) {
    await sendDriverAssignedOrderPush(
      driver.driverFcmToken,
      updatedOrder.orderNumber,
      updatedOrder.customerName,
      updatedOrder.addressLine1,
      updatedOrder.city
    );
  }

  res.status(200).json({
    success: true,
    message: "Driver assigned successfully",
    order: updatedOrder
  });
};