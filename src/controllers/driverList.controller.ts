import { PrismaClient, OrderStatus } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

export const getAllDriversWithStatsController = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const drivers = await prisma.user.findMany({
    where: {
      role: "DRIVER",
      isActive: true
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      isOnline: true,
      lastSeenAt: true,
      latitude: true,
      longitude: true,
      locationUpdatedAt: true,
      assignedOrders: {
        where: {
          orderStatus: {
            in: [
              OrderStatus.PLACED,
              OrderStatus.ACCEPTED,
              OrderStatus.OUT_FOR_DELIVERY
            ]
          }
        },
        select: {
          id: true
        }
      }
    },
    orderBy: {
      firstName: "asc"
    }
  });

  const formattedDrivers = drivers.map((driver) => ({
    id: driver.id,
    firstName: driver.firstName,
    lastName: driver.lastName,
    email: driver.email,
    isOnline: driver.isOnline,
    lastSeenAt: driver.lastSeenAt,
    latitude: driver.latitude,
    longitude: driver.longitude,
    locationUpdatedAt: driver.locationUpdatedAt,
    activeOrderCount: driver.assignedOrders.length
  }));

  res.status(200).json({
    success: true,
    count: formattedDrivers.length,
    drivers: formattedDrivers
  });
};