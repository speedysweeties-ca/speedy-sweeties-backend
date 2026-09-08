import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { parsePickupType } from "../constants/pickupTypes";

const parseCoordinate = (value: unknown): number | null => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;

  return Number.isFinite(parsed) ? parsed : null;
};

const parseOptionalPostalCode = (
  value: unknown
): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed || null;
};

export const listPickupLocationsController = async (
  req: Request,
  res: Response
) => {
  const { pickupType, isActive } = req.query;
  const parsedPickupType = parsePickupType(pickupType);

  if (parsedPickupType === null) {
    return res.status(400).json({
      success: false,
      message: "Invalid pickup type"
    });
  }

  const where: Prisma.PickupLocationWhereInput = {
    ...(parsedPickupType ? { pickupType: parsedPickupType } : {}),
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
    typeof addressLine1 !== "string" ||
    !addressLine1.trim() ||
    typeof city !== "string" ||
    !city.trim() ||
    typeof province !== "string" ||
    !province.trim()
  ) {
    return res.status(400).json({
      success: false,
      message:
        "name, pickupType, addressLine1, city, and province are required"
    });
  }

  const parsedPickupType = parsePickupType(pickupType);

  if (!parsedPickupType || parsedPickupType === "UNKNOWN") {
    return res.status(400).json({
      success: false,
      message: "A valid non-UNKNOWN pickup type is required"
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
      pickupType: parsedPickupType,
      addressLine1: addressLine1.trim(),
      city: city.trim(),
      province: province.trim(),
      postalCode: parseOptionalPostalCode(postalCode) ?? null,
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

  const parsedPickupType = parsePickupType(pickupType);

  if (parsedPickupType === null || parsedPickupType === "UNKNOWN") {
    return res.status(400).json({
      success: false,
      message: "Pickup type must be a valid non-UNKNOWN value"
    });
  }

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

  const parsedPostalCode = parseOptionalPostalCode(postalCode);

  const updatedLocation = await prisma.pickupLocation.update({
    where: { id },
    data: {
      ...(typeof name === "string" && name.trim()
        ? { name: name.trim() }
        : {}),
      ...(parsedPickupType ? { pickupType: parsedPickupType } : {}),
      ...(typeof addressLine1 === "string" && addressLine1.trim()
        ? { addressLine1: addressLine1.trim() }
        : {}),
      ...(typeof city === "string" && city.trim()
        ? { city: city.trim() }
        : {}),
      ...(typeof province === "string" && province.trim()
        ? { province: province.trim() }
        : {}),
      ...(parsedPostalCode !== undefined ? { postalCode: parsedPostalCode } : {}),
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
