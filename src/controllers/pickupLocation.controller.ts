import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const normalizePickupType = (value: string): string =>
  value.trim().toUpperCase();

const parseCoordinate = (value: unknown): number | null => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;

  return Number.isFinite(parsed) ? parsed : null;
};

export const listPickupLocationsController = async (
  req: Request,
  res: Response
) => {
  const { pickupType, isActive } = req.query;

  const where: Prisma.PickupLocationWhereInput = {
    ...(typeof pickupType === "string" && pickupType.trim()
      ? { pickupType: normalizePickupType(pickupType) }
      : {}),
    ...(isActive === "true"
      ? { isActive: true }
      : isActive === "false"
        ? { isActive: false }
        : {})
  };

  const locations = await prisma.pickupLocation.findMany({
    where,
    orderBy: [
      { isActive: "desc" },
      { pickupType: "asc" },
      { name: "asc" }
    ]
  });

  res.status(200).json({
    success: true,
    count: locations.length,
    locations
  });
};

export const createPickupLocationController = async (
  req: Request,
  res: Response
) => {
  const {
    name,
    pickupType,
    addressLine1,
    city,
    province,
    postalCode,
    latitude,
    longitude,
    isActive
  } = req.body;

  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof pickupType !== "string" ||
    !pickupType.trim() ||
    typeof addressLine1 !== "string" ||
    !addressLine1.trim() ||
    typeof city !== "string" ||
    !city.trim() ||
    typeof province !== "string" ||
    !province.trim() ||
    typeof postalCode !== "string" ||
    !postalCode.trim()
  ) {
    return res.status(400).json({
      success: false,
      message:
        "name, pickupType, addressLine1, city, province, and postalCode are required"
    });
  }

  const parsedLatitude = parseCoordinate(latitude);
  const parsedLongitude = parseCoordinate(longitude);

  if (
    parsedLatitude === null ||
    parsedLongitude === null ||
    parsedLatitude < -90 ||
    parsedLatitude > 90 ||
    parsedLongitude < -180 ||
    parsedLongitude > 180
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid latitude and longitude are required"
    });
  }

  const location = await prisma.pickupLocation.create({
    data: {
      name: name.trim(),
      pickupType: normalizePickupType(pickupType),
      addressLine1: addressLine1.trim(),
      city: city.trim(),
      province: province.trim(),
      postalCode: postalCode.trim().toUpperCase(),
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      ...(typeof isActive === "boolean" ? { isActive } : {})
    }
  });

  res.status(201).json({
    success: true,
    message: "Pickup location created successfully",
    location
  });
};

export const updatePickupLocationController = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  const { id } = req.params;

  const existingLocation = await prisma.pickupLocation.findUnique({
    where: { id }
  });

  if (!existingLocation) {
    return res.status(404).json({
      success: false,
      message: "Pickup location not found"
    });
  }

  const {
    name,
    pickupType,
    addressLine1,
    city,
    province,
    postalCode,
    latitude,
    longitude,
    isActive
  } = req.body;

  const parsedLatitude =
    latitude === undefined ? undefined : parseCoordinate(latitude);

  const parsedLongitude =
    longitude === undefined ? undefined : parseCoordinate(longitude);

  if (
    parsedLatitude === null ||
    (parsedLatitude !== undefined &&
      (parsedLatitude < -90 || parsedLatitude > 90))
  ) {
    return res.status(400).json({
      success: false,
      message: "Latitude must be between -90 and 90"
    });
  }

  if (
    parsedLongitude === null ||
    (parsedLongitude !== undefined &&
      (parsedLongitude < -180 || parsedLongitude > 180))
  ) {
    return res.status(400).json({
      success: false,
      message: "Longitude must be between -180 and 180"
    });
  }

  const updatedLocation = await prisma.pickupLocation.update({
    where: { id },
    data: {
      ...(typeof name === "string" && name.trim()
        ? { name: name.trim() }
        : {}),
      ...(typeof pickupType === "string" && pickupType.trim()
        ? { pickupType: normalizePickupType(pickupType) }
        : {}),
      ...(typeof addressLine1 === "string" && addressLine1.trim()
        ? { addressLine1: addressLine1.trim() }
        : {}),
      ...(typeof city === "string" && city.trim()
        ? { city: city.trim() }
        : {}),
      ...(typeof province === "string" && province.trim()
        ? { province: province.trim() }
        : {}),
      ...(typeof postalCode === "string" && postalCode.trim()
        ? { postalCode: postalCode.trim().toUpperCase() }
        : {}),
      ...(parsedLatitude !== undefined ? { latitude: parsedLatitude } : {}),
      ...(parsedLongitude !== undefined ? { longitude: parsedLongitude } : {}),
      ...(typeof isActive === "boolean" ? { isActive } : {})
    }
  });

  res.status(200).json({
    success: true,
    message: "Pickup location updated successfully",
    location: updatedLocation
  });
};

export const deactivatePickupLocationController = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  const { id } = req.params;

  const existingLocation = await prisma.pickupLocation.findUnique({
    where: { id }
  });

  if (!existingLocation) {
    return res.status(404).json({
      success: false,
      message: "Pickup location not found"
    });
  }

  const updatedLocation = await prisma.pickupLocation.update({
    where: { id },
    data: {
      isActive: false
    }
  });

  res.status(200).json({
    success: true,
    message: "Pickup location deactivated successfully",
    location: updatedLocation
  });
};