import { UserRole } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

type Params = {
  id: string;
};

type UpdateDriverDispatchVisibilityBody = {
  isVisibleInDispatch?: unknown;
};

export const getDriversForManagementController = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const drivers = await prisma.user.findMany({
    where: {
      role: UserRole.DRIVER
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      isActive: true,
      isOnline: true,
      isVisibleInDispatch: true,
      createdAt: true
    },
    orderBy: [
      { firstName: "asc" },
      { lastName: "asc" },
      { email: "asc" }
    ]
  });

  res.status(200).json({
    success: true,
    count: drivers.length,
    drivers
  });
};

export const updateDriverDispatchVisibilityController = async (
  req: Request<Params, unknown, UpdateDriverDispatchVisibilityBody>,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { isVisibleInDispatch } = req.body;

  if (typeof isVisibleInDispatch !== "boolean") {
    res.status(400).json({
      success: false,
      message: "isVisibleInDispatch must be true or false"
    });
    return;
  }

  const driver = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true
    }
  });

  if (!driver || driver.role !== UserRole.DRIVER) {
    res.status(404).json({
      success: false,
      message: "Driver not found"
    });
    return;
  }

  const now = new Date();
  const updatedDriver = await prisma.user.update({
    where: { id },
    data: isVisibleInDispatch
      ? {
          isVisibleInDispatch: true
        }
      : {
          isVisibleInDispatch: false,
          isOnline: false,
          lastSeenAt: now,
          forceLogoutAt: now
        },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      isActive: true,
      isOnline: true,
      isVisibleInDispatch: true
    }
  });

  res.status(200).json({
    success: true,
    message: updatedDriver.isVisibleInDispatch
      ? "Driver is now visible in dispatch"
      : "Driver is now hidden from dispatch",
    driver: updatedDriver
  });
};

export const forceLogoutDriverController = async (
  req: Request<Params>,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const driver = await prisma.user.findUnique({
    where: { id }
  });

  if (!driver || driver.role !== UserRole.DRIVER) {
    res.status(404).json({
      success: false,
      message: "Driver not found"
    });
    return;
  }

  await prisma.user.update({
    where: { id },
    data: {
      isOnline: false,
      lastSeenAt: new Date(),
      forceLogoutAt: new Date()
    }
  });

  res.status(200).json({
    success: true,
    message: "Driver has been logged out successfully"
  });
};