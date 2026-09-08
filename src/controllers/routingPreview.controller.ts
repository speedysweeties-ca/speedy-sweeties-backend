import { OrderStatus, UserRole } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { isDriverFresh } from "../utils/driverFreshness";

export const ROUTING_PREVIEW_PICKUP_TYPES = [
  "CONVENIENCE",
  "BEER_STORE",
  "LCBO",
  "VAPE",
  "DISPENSARY"
] as const;

const ROUTING_PREVIEW_PICKUP_TYPE_SET = new Set<string>(
  ROUTING_PREVIEW_PICKUP_TYPES
);

const ACTIVE_DRIVER_ORDER_STATUSES = [
  OrderStatus.PLACED,
  OrderStatus.DISPATCHED,
  OrderStatus.ACCEPTED,
  OrderStatus.OUT_FOR_DELIVERY
];

type RoutingPreviewItem = {
  itemCatalog?: {
    pickupType?: string | null;
  } | null;
};

export type RoutingPickupRequirement = {
  pickupRequired: boolean;
  requiredPickupTypes: string[];
  unknownPickupItemCount: number;
  unsupportedPickupTypes: string[];
};

export const normalizeRoutingPickupType = (
  value: string | null | undefined
): string => {
  const normalized = String(value || "UNKNOWN").trim().toUpperCase();
  return normalized || "UNKNOWN";
};

export const buildRoutingPickupRequirement = (
  items: RoutingPreviewItem[],
  orderStatus: OrderStatus | string
): RoutingPickupRequirement => {
  const normalizedTypes = items.map((item) =>
    normalizeRoutingPickupType(item.itemCatalog?.pickupType)
  );

  const unknownPickupItemCount = normalizedTypes.filter(
    (pickupType) => pickupType === "UNKNOWN"
  ).length;

  const distinctKnownTypes = Array.from(
    new Set(normalizedTypes.filter((pickupType) => pickupType !== "UNKNOWN"))
  );

  const supportedPickupTypes = distinctKnownTypes.filter((pickupType) =>
    ROUTING_PREVIEW_PICKUP_TYPE_SET.has(pickupType)
  );

  const unsupportedPickupTypes = distinctKnownTypes.filter(
    (pickupType) => !ROUTING_PREVIEW_PICKUP_TYPE_SET.has(pickupType)
  );

  const pickupRequired =
    orderStatus !== OrderStatus.OUT_FOR_DELIVERY &&
    orderStatus !== OrderStatus.DELIVERED &&
    orderStatus !== OrderStatus.CANCELLED;

  return {
    pickupRequired,
    requiredPickupTypes: pickupRequired ? supportedPickupTypes : [],
    unknownPickupItemCount,
    unsupportedPickupTypes
  };
};

const getDriverDisplayName = (driver: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}): string => {
  const name = [driver.firstName, driver.lastName]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");

  return name || driver.email.split("@")[0] || "Driver";
};

const hasVerifiedDestination = (order: {
  geocodeStatus: string | null;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
}): boolean =>
  order.geocodeStatus === "VERIFIED" &&
  Number.isFinite(order.deliveryLatitude) &&
  Number.isFinite(order.deliveryLongitude);

export const getRoutingPreviewController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const orderId = String(req.params.id || "").trim();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          itemCatalog: {
            select: {
              pickupType: true
            }
          }
        }
      }
    }
  });

  if (!order) {
    res.status(404).json({
      success: false,
      message: "Order not found"
    });
    return;
  }

  if (!hasVerifiedDestination(order)) {
    res.status(409).json({
      success: false,
      code: "ROUTING_DESTINATION_UNAVAILABLE",
      message: "The order does not have a verified delivery location yet."
    });
    return;
  }

  const pickupRequirement = buildRoutingPickupRequirement(
    order.items,
    order.orderStatus
  );

  const [pickupLocations, driverRows] = await Promise.all([
    pickupRequirement.pickupRequired &&
    pickupRequirement.requiredPickupTypes.length > 0
      ? prisma.pickupLocation.findMany({
          where: {
            isActive: true,
            pickupType: {
              in: pickupRequirement.requiredPickupTypes
            }
          },
          select: {
            id: true,
            name: true,
            pickupType: true,
            addressLine1: true,
            city: true,
            province: true,
            postalCode: true,
            latitude: true,
            longitude: true
          },
          orderBy: [
            { pickupType: "asc" },
            { name: "asc" }
          ]
        })
      : Promise.resolve([]),
    prisma.user.findMany({
      where: {
        role: UserRole.DRIVER,
        isActive: true,
        isVisibleInDispatch: true,
        isOnline: true
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        lastSeenAt: true,
        latitude: true,
        longitude: true,
        locationUpdatedAt: true,
        locationRecordedAt: true,
        locationAccuracyMeters: true,
        assignedOrders: {
          where: {
            orderStatus: {
              in: ACTIVE_DRIVER_ORDER_STATUSES
            }
          },
          select: {
            id: true
          }
        }
      },
      orderBy: [
        { firstName: "asc" },
        { lastName: "asc" }
      ]
    })
  ]);

  const now = new Date();
  const drivers = driverRows
    .filter(
      (driver) =>
        isDriverFresh(driver.lastSeenAt, now) &&
        Number.isFinite(driver.latitude) &&
        Number.isFinite(driver.longitude)
    )
    .map((driver) => ({
      id: driver.id,
      displayName: getDriverDisplayName(driver),
      latitude: driver.latitude as number,
      longitude: driver.longitude as number,
      lastSeenAt: driver.lastSeenAt,
      locationUpdatedAt: driver.locationUpdatedAt,
      locationRecordedAt: driver.locationRecordedAt,
      locationAccuracyMeters: driver.locationAccuracyMeters,
      activeOrderCount: driver.assignedOrders.length
    }));

  res.status(200).json({
    success: true,
    generatedAt: now.toISOString(),
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      destination: {
        addressLine1: order.addressLine1,
        city: order.city,
        province: order.province,
        postalCode: order.postalCode,
        latitude: order.deliveryLatitude as number,
        longitude: order.deliveryLongitude as number
      },
      pickupRequired: pickupRequirement.pickupRequired,
      requiredPickupTypes: pickupRequirement.requiredPickupTypes,
      unknownPickupItemCount: pickupRequirement.unknownPickupItemCount,
      unsupportedPickupTypes: pickupRequirement.unsupportedPickupTypes
    },
    pickupLocations,
    drivers
  });
};
