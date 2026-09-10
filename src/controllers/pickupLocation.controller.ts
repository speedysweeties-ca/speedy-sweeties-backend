import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import {
  ROUTABLE_PICKUP_TYPE_OPTIONS,
  isRoutablePickupType,
  parsePickupType
} from "../constants/pickupTypes";
import {
  parsePickupLocationRoutingPriority
} from "../constants/pickupLocationRoutingPriority";
import { prisma } from "../lib/prisma";
import { refreshPickupLocationHours } from "../services/pickupLocationHours.service";

const parseCoordinate = (value: unknown): number | null => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;

  return Number.isFinite(parsed) ? parsed : null;
};

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ManualOverrideParseResult =
  | { ok: true; value: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput }
  | { ok: false; message: string };

const isValidDateOnly = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const parseManualHoursOverride = (value: unknown): ManualOverrideParseResult => {
  if (value === null) {
    return { ok: true, value: Prisma.DbNull };
  }

  if (!Array.isArray(value)) {
    return {
      ok: false,
      message: "manualHoursOverride must be an array or null"
    };
  }

  if (value.length > 31) {
    return {
      ok: false,
      message: "manualHoursOverride can contain at most 31 dated entries"
    };
  }

  const normalized: Array<Record<string, Prisma.JsonValue>> = [];
  const seenDates = new Set<string>();

  for (const rawEntry of value) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      return {
        ok: false,
        message: "Each manual hours override entry must be an object"
      };
    }

    const entry = rawEntry as Record<string, unknown>;
    const date = typeof entry.date === "string" ? entry.date.trim() : "";
    const isClosed = entry.isClosed;
    const openTime =
      typeof entry.openTime === "string" ? entry.openTime.trim() : undefined;
    const closeTime =
      typeof entry.closeTime === "string" ? entry.closeTime.trim() : undefined;
    const note = typeof entry.note === "string" ? entry.note.trim() : undefined;

    if (!isValidDateOnly(date)) {
      return {
        ok: false,
        message: "Each manual hours override requires a valid YYYY-MM-DD date"
      };
    }

    if (seenDates.has(date)) {
      return {
        ok: false,
        message: `Duplicate manual hours override date: ${date}`
      };
    }
    seenDates.add(date);

    if (typeof isClosed !== "boolean") {
      return {
        ok: false,
        message: `Manual hours override for ${date} requires isClosed true or false`
      };
    }

    if (!isClosed) {
      if (!openTime || !TIME_PATTERN.test(openTime)) {
        return {
          ok: false,
          message: `Manual hours override for ${date} requires openTime in HH:MM format`
        };
      }
      if (!closeTime || !TIME_PATTERN.test(closeTime)) {
        return {
          ok: false,
          message: `Manual hours override for ${date} requires closeTime in HH:MM format`
        };
      }
    }

    if (note && note.length > 200) {
      return {
        ok: false,
        message: `Manual hours override note for ${date} must be 200 characters or fewer`
      };
    }

    normalized.push({
      date,
      isClosed,
      ...(isClosed ? {} : { openTime: openTime!, closeTime: closeTime! }),
      ...(note ? { note } : {})
    });
  }

  normalized.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return {
    ok: true,
    value: normalized as unknown as Prisma.InputJsonValue
  };
};

export const listPickupLocationsController = async (
  req: Request,
  res: Response
) => {
  const { pickupType, isActive } = req.query;
  const pickupTypeFilter = parsePickupType(pickupType);

  if (pickupTypeFilter === null) {
    return res.status(400).json({
      success: false,
      message: "Invalid pickup type"
    });
  }

  const where: Prisma.PickupLocationWhereInput = {
    ...(pickupTypeFilter ? { pickupType: pickupTypeFilter } : {}),
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
    latitude,
    longitude,
    isActive,
    routingPriority,
    googlePlaceId,
    postalCode
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
    !province.trim()
  ) {
    return res.status(400).json({
      success: false,
      message:
        "name, pickupType, addressLine1, city, and province are required"
    });
  }

  const parsedPickupType = parsePickupType(pickupType);
  const parsedRoutingPriority =
    routingPriority === undefined
      ? "STANDARD"
      : parsePickupLocationRoutingPriority(routingPriority);

  if (!parsedPickupType || !isRoutablePickupType(parsedPickupType)) {
    return res.status(400).json({
      success: false,
      message: `pickupType must be one of: ${ROUTABLE_PICKUP_TYPE_OPTIONS.join(", ")}`
    });
  }

  if (!parsedRoutingPriority) {
    return res.status(400).json({
      success: false,
      message: "routingPriority must be one of: PREFERRED, STANDARD, FALLBACK"
    });
  }

  if (
    postalCode !== undefined &&
    postalCode !== null &&
    typeof postalCode !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "postalCode must be a string or null"
    });
  }

  const normalizedPostalCode =
    postalCode === undefined
      ? undefined
      : typeof postalCode === "string"
        ? postalCode.trim() || null
        : null;

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
      ...(normalizedPostalCode !== undefined
        ? { postalCode: normalizedPostalCode }
        : {}),
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      ...(typeof isActive === "boolean" ? { isActive } : {}),
      routingPriority: parsedRoutingPriority,
      ...(typeof googlePlaceId === "string" && googlePlaceId.trim()
        ? { googlePlaceId: googlePlaceId.trim() }
        : {})
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
    latitude,
    longitude,
    isActive,
    routingPriority,
    googlePlaceId,
    manualHoursOverride,
    manualHoursOverrideNote,
    postalCode
  } = req.body;

  const parsedPickupType = parsePickupType(pickupType);
  const parsedRoutingPriority =
    routingPriority === undefined
      ? undefined
      : parsePickupLocationRoutingPriority(routingPriority);

  if (
    pickupType !== undefined &&
    (parsedPickupType === null ||
      parsedPickupType === undefined ||
      !isRoutablePickupType(parsedPickupType))
  ) {
    return res.status(400).json({
      success: false,
      message: `pickupType must be one of: ${ROUTABLE_PICKUP_TYPE_OPTIONS.join(", ")}`
    });
  }

  if (routingPriority !== undefined && !parsedRoutingPriority) {
    return res.status(400).json({
      success: false,
      message: "routingPriority must be one of: PREFERRED, STANDARD, FALLBACK"
    });
  }

  if (
    postalCode !== undefined &&
    postalCode !== null &&
    typeof postalCode !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "postalCode must be a string or null"
    });
  }

  const normalizedPostalCode =
    postalCode === undefined
      ? undefined
      : typeof postalCode === "string"
        ? postalCode.trim() || null
        : null;

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

  const manualOverrideParsed =
    manualHoursOverride === undefined
      ? undefined
      : parseManualHoursOverride(manualHoursOverride);

  if (manualOverrideParsed?.ok === false) {
    return res.status(400).json({
      success: false,
      message: manualOverrideParsed.message
    });
  }

  if (
    manualHoursOverrideNote !== undefined &&
    manualHoursOverrideNote !== null &&
    typeof manualHoursOverrideNote !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "manualHoursOverrideNote must be a string or null"
    });
  }

  if (
    typeof manualHoursOverrideNote === "string" &&
    manualHoursOverrideNote.trim().length > 500
  ) {
    return res.status(400).json({
      success: false,
      message: "manualHoursOverrideNote must be 500 characters or fewer"
    });
  }

  const normalizedGooglePlaceId =
    googlePlaceId === undefined
      ? undefined
      : googlePlaceId === null
        ? null
        : typeof googlePlaceId === "string"
          ? googlePlaceId.trim() || null
          : undefined;

  if (
    googlePlaceId !== undefined &&
    googlePlaceId !== null &&
    typeof googlePlaceId !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "googlePlaceId must be a string or null"
    });
  }

  const googlePlaceIdChanged =
    normalizedGooglePlaceId !== undefined &&
    normalizedGooglePlaceId !== existingLocation.googlePlaceId;

  const manualOverrideChanged =
    manualHoursOverride !== undefined || manualHoursOverrideNote !== undefined;

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
      ...(normalizedPostalCode !== undefined
        ? { postalCode: normalizedPostalCode }
        : {}),
      ...(parsedLatitude !== undefined ? { latitude: parsedLatitude } : {}),
      ...(parsedLongitude !== undefined ? { longitude: parsedLongitude } : {}),
      ...(typeof isActive === "boolean" ? { isActive } : {}),
      ...(parsedRoutingPriority ? { routingPriority: parsedRoutingPriority } : {}),
      ...(normalizedGooglePlaceId !== undefined
        ? { googlePlaceId: normalizedGooglePlaceId }
        : {}),
      ...(googlePlaceIdChanged
        ? {
            googleBusinessStatus: null,
            regularOpeningHours: Prisma.DbNull,
            currentOpeningHours: Prisma.DbNull,
            regularHoursUpdatedAt: null,
            currentHoursUpdatedAt: null,
            hoursLastCheckedAt: null,
            hoursLastError: null
          }
        : {}),
      ...(manualOverrideParsed?.ok
        ? { manualHoursOverride: manualOverrideParsed.value }
        : {}),
      ...(manualHoursOverrideNote === null
        ? { manualHoursOverrideNote: null }
        : typeof manualHoursOverrideNote === "string"
          ? { manualHoursOverrideNote: manualHoursOverrideNote.trim() || null }
          : {}),
      ...(manualOverrideChanged
        ? { manualHoursOverrideUpdatedAt: new Date() }
        : {})
    }
  });

  res.status(200).json({
    success: true,
    message: "Pickup location updated successfully",
    location: updatedLocation
  });
};

export const refreshPickupLocationHoursController = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  const { id } = req.params;
  const existingLocation = await prisma.pickupLocation.findUnique({
    where: { id },
    select: { id: true }
  });

  if (!existingLocation) {
    return res.status(404).json({
      success: false,
      message: "Pickup location not found"
    });
  }

  const refreshRegular = req.body?.regular !== false;
  const refreshCurrent = req.body?.current !== false;

  if (!refreshRegular && !refreshCurrent) {
    return res.status(400).json({
      success: false,
      message: "At least one of regular or current must be refreshed"
    });
  }

  const summary = await refreshPickupLocationHours({
    locationId: id,
    forceRegular: refreshRegular,
    forceCurrent: refreshCurrent
  });

  const location = await prisma.pickupLocation.findUnique({ where: { id } });

  return res.status(summary.failed > 0 ? 502 : 200).json({
    success: summary.failed === 0,
    summary,
    location
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
