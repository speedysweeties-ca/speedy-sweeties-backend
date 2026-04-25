import { PrismaClient, OrderStatus, UserRole } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

const ACTIVE_STATUSES: OrderStatus[] = [
  "PLACED",
  "ACCEPTED",
  "OUT_FOR_DELIVERY"
];

const ALL_STATUSES: OrderStatus[] = [
  "PLACED",
  "ACCEPTED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED"
];

const toMinutes = (start: Date, end: Date): number => {
  return Math.round(((end.getTime() - start.getTime()) / 1000 / 60) * 100) / 100;
};

const average = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 100) / 100;
};

export const getOrderStatsController = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const counts = await Promise.all(
    ALL_STATUSES.map((status) =>
      prisma.order.count({
        where: { orderStatus: status }
      })
    )
  );

  const stats = ALL_STATUSES.reduce((acc, status, index) => {
    acc[status] = counts[index];
    return acc;
  }, {} as Record<OrderStatus, number>);

  const drivers = await prisma.user.findMany({
    where: {
      role: UserRole.DRIVER,
      isActive: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  const driverWorkload = await Promise.all(
    drivers.map(async (driver) => {
      const activeCallCount = await prisma.order.count({
        where: {
          assignedDriverId: driver.id,
          orderStatus: {
            in: ACTIVE_STATUSES
          }
        }
      });

      return {
        id: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        email: driver.email,
        activeCallCount
      };
    })
  );

  const completedOrders = await prisma.order.findMany({
    where: {
      orderStatus: OrderStatus.DELIVERED
    },
    select: {
      id: true,
      createdAt: true,
      acceptedAt: true,
      outForDeliveryAt: true,
      deliveredAt: true,
      assignedAt: true
    }
  });

  const acceptanceTimes: number[] = [];
  const dispatchTimes: number[] = [];
  const deliveryTimes: number[] = [];
  const totalOrderTimes: number[] = [];
  const assignmentToAcceptanceTimes: number[] = [];

  for (const order of completedOrders) {
    if (order.acceptedAt) {
      acceptanceTimes.push(toMinutes(order.createdAt, order.acceptedAt));
    }

    if (order.acceptedAt && order.outForDeliveryAt) {
      dispatchTimes.push(toMinutes(order.acceptedAt, order.outForDeliveryAt));
    }

    if (order.outForDeliveryAt && order.deliveredAt) {
      deliveryTimes.push(toMinutes(order.outForDeliveryAt, order.deliveredAt));
    }

    if (order.deliveredAt) {
      totalOrderTimes.push(toMinutes(order.createdAt, order.deliveredAt));
    }

    if (order.assignedAt && order.acceptedAt) {
      assignmentToAcceptanceTimes.push(
        toMinutes(order.assignedAt, order.acceptedAt)
      );
    }
  }

  res.status(200).json({
    success: true,
    stats,
    driverWorkload,
    timelineMetrics: {
      deliveredOrdersCount: completedOrders.length,
      averageMinutesFromCreatedToAccepted: average(acceptanceTimes),
      averageMinutesFromAcceptedToOutForDelivery: average(dispatchTimes),
      averageMinutesFromOutForDeliveryToDelivered: average(deliveryTimes),
      averageMinutesFromCreatedToDelivered: average(totalOrderTimes),
      averageMinutesFromAssignedToAccepted: average(assignmentToAcceptanceTimes)
    }
  });
};