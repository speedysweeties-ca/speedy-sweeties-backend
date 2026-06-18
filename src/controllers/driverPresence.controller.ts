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

const getValidOptionalNumberFromRequest = (
  req: Request,
  fieldName: string,
  min: number,
  max: number
): number | null => {
  const rawValue = req.body?.[fieldName];

  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return null;
  }

  const numberValue = Number(rawValue);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  if (numberValue < min || numberValue > max) {
    return null;
  }

  return numberValue;
};

const getValidLocationTimestampFromRequest = (req: Request): Date | null => {
  const rawTimestamp = req.body?.locationTimestampMs;

  if (rawTimestamp === undefined || rawTimestamp === null || rawTimestamp === "") {
    return null;
  }

  const timestampMs = Number(rawTimestamp);

  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return null;
  }

  const date = new Date(timestampMs);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const getValidDriverAppStateFromRequest = (req: Request): string | null => {
  const rawAppState = req.body?.appState;

  if (typeof rawAppState !== "string") {
    return null;
  }

  const cleaned = rawAppState.trim().toUpperCase();

  if (cleaned !== "FOREGROUND" && cleaned !== "BACKGROUND") {
    return null;
  }

  return cleaned;
};

const getValidDriverFcmTokenFromRequest = (req: Request): string | null => {
  const rawToken = req.body?.driverFcmToken;

  if (typeof rawToken !== "string") {
    return null;
  }

  const cleaned = rawToken.trim();

  return cleaned ? cleaned : null;
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
      lastSeenAt: new Date(),
      driverAppState: "FOREGROUND",
      driverAppStateUpdatedAt: new Date()
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
      lastSeenAt: new Date(),
      driverAppState: "BACKGROUND",
      driverAppStateUpdatedAt: new Date()
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

  const now = new Date();

  const validLocation = getValidLocationFromRequest(req);
  const validAppState = getValidDriverAppStateFromRequest(req);
  const validDriverFcmToken = getValidDriverFcmTokenFromRequest(req);

  const accuracyMeters = getValidOptionalNumberFromRequest(
    req,
    "accuracyMeters",
    0,
    10000
  );

  const speedMetersPerSecond = getValidOptionalNumberFromRequest(
    req,
    "speedMetersPerSecond",
    0,
    100
  );

  const headingDegrees = getValidOptionalNumberFromRequest(
    req,
    "headingDegrees",
    0,
    360
  );

  const locationRecordedAt = getValidLocationTimestampFromRequest(req);

  await prisma.user.update({
    where: { id: authUser.userId },
    data: {
      isOnline: true,
      lastSeenAt: now,

      ...(validLocation
        ? {
            latitude: validLocation.latitude,
            longitude: validLocation.longitude,
            locationUpdatedAt: now,
            locationAccuracyMeters: accuracyMeters,
            locationSpeedMetersPerSecond: speedMetersPerSecond,
            locationHeadingDegrees: headingDegrees,
            locationRecordedAt: locationRecordedAt || now
          }
        : {}),

      ...(validAppState
        ? {
            driverAppState: validAppState,
            driverAppStateUpdatedAt: now
          }
        : {}),

      ...(validDriverFcmToken
        ? {
            driverFcmToken: validDriverFcmToken
          }
        : {})
    }
  });

  res.status(200).json({
    success: true,
    message: validLocation
      ? "Driver heartbeat, app state, and location received"
      : "Driver heartbeat and app state received"
  });
};