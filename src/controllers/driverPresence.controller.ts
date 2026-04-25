import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

type AuthenticatedUser = {
  userId: string;
  email: string;
  role: string;
};

const getAuthUser = (req: Request): AuthenticatedUser | undefined => {
  return (req as Request & { user?: AuthenticatedUser }).user;
};

const getValidLocationFromRequest = (
  req: Request
): { latitude: number; longitude: number } | null => {
  const latitude = Number(req.body?.latitude);
  const longitude = Number(req.body?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90) {
    return null;
  }

  if (longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
};

export const setDriverOnlineController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    res.status(401).json({
      success: false,
      message: "Unauthorized"
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.userId }
  });

  if (!user) {
    res.status(404).json({
      success: false,
      message: "Driver not found"
    });
    return;
  }

  await prisma.user.update({
    where: { id: authUser.userId },
    data: {
      isOnline: true,
      lastSeenAt: new Date()
    }
  });

  res.status(200).json({
    success: true,
    message: "Driver marked online"
  });
};

export const setDriverOfflineController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    res.status(401).json({
      success: false,
      message: "Unauthorized"
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.userId }
  });

  if (!user) {
    res.status(404).json({
      success: false,
      message: "Driver not found"
    });
    return;
  }

  await prisma.user.update({
    where: { id: authUser.userId },
    data: {
      isOnline: false,
      lastSeenAt: new Date()
    }
  });

  res.status(200).json({
    success: true,
    message: "Driver marked offline"
  });
};

export const heartbeatDriverController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    res.status(401).json({
      success: false,
      message: "Unauthorized"
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.userId }
  });

  if (!user) {
    res.status(404).json({
      success: false,
      message: "Driver not found"
    });
    return;
  }

  const validLocation = getValidLocationFromRequest(req);

  await prisma.user.update({
    where: { id: authUser.userId },
    data: {
      isOnline: true,
      lastSeenAt: new Date(),
      ...(validLocation
        ? {
            latitude: validLocation.latitude,
            longitude: validLocation.longitude,
            locationUpdatedAt: new Date()
          }
        : {})
    }
  });

  res.status(200).json({
    success: true,
    message: validLocation
      ? "Driver heartbeat and location received"
      : "Driver heartbeat received"
  });
};