import { PrismaClient, OrderStatus, Prisma } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

const getMinutesBetween = (start?: Date | null, end?: Date | null): number | null => {
  if (!start || !end) return null;

  const diffMs = end.getTime() - start.getTime();

  if (diffMs < 0) return null;

  return Math.round(diffMs / 60000);
};

export const getDriverStatsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const startDate =
    typeof req.query.startDate === "string" ? req.query.startDate : undefined;

  const endDate =
    typeof req.query.endDate === "string" ? req.query.endDate : undefined;

  const driverIds =
    typeof req.query.driverIds === "string"
      ? req.query.driverIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : [];

  const whereClause: Prisma.OrderWhereInput = {
    orderStatus: OrderStatus.DELIVERED,
    assignedDriverId: {
      not: null
    }
  };

  if (driverIds.length > 0) {
    whereClause.assignedDriverId = {
      in: driverIds
    };
  }

  if (startDate || endDate) {
    whereClause.deliveredAt = {};

    if (startDate) {
      whereClause.deliveredAt.gte = new Date(`${startDate}T00:00:00`);
    }

    if (endDate) {
      whereClause.deliveredAt.lte = new Date(`${endDate}T23:59:59`);
    }
  }

  const deliveredOrders = await prisma.order.findMany({
    where: whereClause,
    select: {
      id: true,
      createdAt: true,
      acceptedAt: true,
      outForDeliveryAt: true,
      deliveredAt: true,
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

  const statsByDriver = new Map<
    string,
    {
      driverId: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      totalDeliveries: number;
      totalDeliveryMinutes: number;
      deliveryTimeSamples: number;
      fastestDeliveryMinutes: number | null;
      slowestDeliveryMinutes: number | null;
    }
  >();

  for (const order of deliveredOrders) {
    if (!order.assignedDriver) continue;

    const driverId = order.assignedDriver.id;

    if (!statsByDriver.has(driverId)) {
      statsByDriver.set(driverId, {
        driverId,
        firstName: order.assignedDriver.firstName,
        lastName: order.assignedDriver.lastName,
        email: order.assignedDriver.email,
        totalDeliveries: 0,
        totalDeliveryMinutes: 0,
        deliveryTimeSamples: 0,
        fastestDeliveryMinutes: null,
        slowestDeliveryMinutes: null
      });
    }

    const stat = statsByDriver.get(driverId);
    if (!stat) continue;

    stat.totalDeliveries += 1;

    const deliveryMinutes = getMinutesBetween(
      order.acceptedAt,
      order.deliveredAt
    );

    if (deliveryMinutes !== null) {
      stat.totalDeliveryMinutes += deliveryMinutes;
      stat.deliveryTimeSamples += 1;

      if (
        stat.fastestDeliveryMinutes === null ||
        deliveryMinutes < stat.fastestDeliveryMinutes
      ) {
        stat.fastestDeliveryMinutes = deliveryMinutes;
      }

      if (
        stat.slowestDeliveryMinutes === null ||
        deliveryMinutes > stat.slowestDeliveryMinutes
      ) {
        stat.slowestDeliveryMinutes = deliveryMinutes;
      }
    }
  }

  const stats = Array.from(statsByDriver.values())
    .map((stat) => ({
      driverId: stat.driverId,
      firstName: stat.firstName,
      lastName: stat.lastName,
      email: stat.email,
      totalDeliveries: stat.totalDeliveries,
      averageDeliveryMinutes:
        stat.deliveryTimeSamples > 0
          ? Math.round(stat.totalDeliveryMinutes / stat.deliveryTimeSamples)
          : null,
      fastestDeliveryMinutes: stat.fastestDeliveryMinutes,
      slowestDeliveryMinutes: stat.slowestDeliveryMinutes
    }))
    .sort((a, b) => b.totalDeliveries - a.totalDeliveries);

  res.status(200).json({
    success: true,
    count: stats.length,
    stats
  });
};