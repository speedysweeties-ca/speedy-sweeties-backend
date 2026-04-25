import {
  PrismaClient,
  UserRole,
  OrderStatus,
  OrderPriority
} from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

type AssignDriverParams = {
  id: string;
};

type AssignDriverBody = {
  driverId: string | null;
  priority?: OrderPriority;
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
      isActive: true
    }
  });

  if (!driver) {
    res.status(404).json({
      success: false,
      message: "Active driver not found"
    });
    return;
  }

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

  res.status(200).json({
    success: true,
    message: "Driver assigned successfully",
    order: updatedOrder
  });
};