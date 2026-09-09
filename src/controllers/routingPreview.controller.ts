import { OrderStatus, UserRole } from "@prisma/client";
import { Request, Response } from "express";
import { env } from "../config/env";
import { normalizePickupTypeOrUnknown } from "../constants/pickupTypes";
import { prisma } from "../lib/prisma";
import {
  computeTrafficAwareRouteMatrix,
  RoutingPreviewUnavailableError,
  type RoutingPreviewMatrixResult
} from "../services/routingPreview.service";
import {
  computeTrafficAwareRouteMatrixToDestinations,
  type MultiDestinationRouteMatrixResult
} from "../services/multiDestinationRouteMatrix.service";
import {
  PICKUP_STORE_CLOSING_BUFFER_MINUTES,
  selectPickupStoreRecommendations,
  type PickupStoreCandidate
} from "../services/pickupStoreRouting.service";
import {
  isDriverFresh,
  isDriverLocationFresh
} from "../utils/driverFreshness";
import { buildRoutablePickupLocationWhere } from "../utils/pickupLocationAvailability";

type CachedRoutingPreview = {
  key: string;
  expiresAtMs: number;
  matrix: RoutingPreviewMatrixResult[];
};

type CachedPickupRoutingMatrix = {
  key: string;
  expiresAtMs: number;
  matrix: MultiDestinationRouteMatrixResult[];
};

const routingPreviewCache = new Map<string, CachedRoutingPreview>();
const pickupRoutingMatrixCache = new Map<string, CachedPickupRoutingMatrix>();

const buildCacheKey = (
  orderId: string,
  destinationLatitude: number,
  destinationLongitude: number,
  routeableDriverIds: string[]
): string =>
  [
    orderId,
    destinationLatitude.toFixed(6),
    destinationLongitude.toFixed(6),
    [...routeableDriverIds].sort().join(",")
  ].join("|");

const buildPickupRoutingCacheKey = (
  orderId: string,
  routeableDriverIds: string[],
  stores: Array<
    PickupStoreCandidate & {
      currentHoursUpdatedAt: Date | null;
      regularHoursUpdatedAt: Date | null;
      manualHoursOverrideUpdatedAt: Date | null;
    }
  >
): string =>
  [
    orderId,
    [...routeableDriverIds].sort().join(","),
    stores
      .map((store) =>
        [
          store.id,
          store.latitude.toFixed(6),
          store.longitude.toFixed(6),
          store.currentHoursUpdatedAt?.toISOString() ?? "",
          store.regularHoursUpdatedAt?.toISOString() ?? "",
          store.manualHoursOverrideUpdatedAt?.toISOString() ?? ""
        ].join(":")
      )
      .sort()
      .join(",")
  ].join("|");

const toMinutes = (durationSeconds: number | null): number | null =>
  durationSeconds === null ? null : Math.max(1, Math.round(durationSeconds / 60));

export const getOrderRoutingPreviewController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    res.status(400).json({
      success: false,
      code: "INVALID_ORDER_ID",
      message: "A valid order ID is required."
    });
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      addressLine1: true,
      city: true,
      province: true,
      orderStatus: true,
      deliveryLatitude: true,
      deliveryLongitude: true,
      geocodeStatus: true,
      items: {
        select: {
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
      code: "ORDER_NOT_FOUND",
      message: "Order not found."
    });
    return;
  }

  const itemPickupTypes = order.items.map((item) =>
    normalizePickupTypeOrUnknown(item.itemCatalog?.pickupType)
  );
  const unknownItemCount = itemPickupTypes.filter(
    (pickupType) => pickupType === "UNKNOWN"
  ).length;
  const requiredPickupTypes = Array.from(
    new Set(itemPickupTypes.filter((pickupType) => pickupType !== "UNKNOWN"))
  ).sort((a, b) => a.localeCompare(b));

  const hasStoredDestination =
    order.deliveryLatitude !== null && order.deliveryLongitude !== null;
  const destinationLatitude = hasStoredDestination
    ? Number(order.deliveryLatitude)
    : Number.NaN;
  const destinationLongitude = hasStoredDestination
    ? Number(order.deliveryLongitude)
    : Number.NaN;
  const hasVerifiedDestination =
    order.geocodeStatus === "VERIFIED" &&
    hasStoredDestination &&
    Number.isFinite(destinationLatitude) &&
    Number.isFinite(destinationLongitude);

  if (!hasVerifiedDestination) {
    res.status(409).json({
      success: false,
      code: "DELIVERY_LOCATION_UNAVAILABLE",
      message: "This order does not have a verified delivery location yet."
    });
    return;
  }

  const now = new Date();
  const drivers = await prisma.user.findMany({
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
        select: { id: true }
      }
    },
    orderBy: [{ firstName: "asc" }, { email: "asc" }]
  });

  const onlineDrivers = drivers.filter((driver) =>
    isDriverFresh(driver.lastSeenAt, now)
  );

  const routeableDrivers = onlineDrivers.filter((driver) => {
    if (driver.latitude === null || driver.longitude === null) return false;

    const latitude = Number(driver.latitude);
    const longitude = Number(driver.longitude);

    return (
      isDriverLocationFresh(driver.lastSeenAt, driver.locationUpdatedAt, now) &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    );
  });
  const routeableDriverIds = new Set(
    routeableDrivers.map((driver) => driver.id)
  );

  const pickupStores =
    requiredPickupTypes.length === 0
      ? []
      : ((await prisma.pickupLocation.findMany({
          where: buildRoutablePickupLocationWhere(requiredPickupTypes),
          select: {
            id: true,
            name: true,
            pickupType: true,
            addressLine1: true,
            city: true,
            province: true,
            latitude: true,
            longitude: true,
            googleBusinessStatus: true,
            regularOpeningHours: true,
            currentOpeningHours: true,
            manualHoursOverride: true,
            currentHoursUpdatedAt: true,
            regularHoursUpdatedAt: true,
            manualHoursOverrideUpdatedAt: true
          },
          orderBy: [{ pickupType: "asc" }, { name: "asc" }]
        })) as Array<
          PickupStoreCandidate & {
            currentHoursUpdatedAt: Date | null;
            regularHoursUpdatedAt: Date | null;
            manualHoursOverrideUpdatedAt: Date | null;
          }
        >);

  const cacheKey = buildCacheKey(
    order.id,
    destinationLatitude,
    destinationLongitude,
    routeableDrivers.map((driver) => driver.id)
  );
  const forceRefresh = String(req.query.refresh || "").toLowerCase() === "true";
  const cached = routingPreviewCache.get(order.id);
  const canUseCache =
    !forceRefresh &&
    cached?.key === cacheKey &&
    cached.expiresAtMs > now.getTime();

  let matrix: RoutingPreviewMatrixResult[] = [];
  let cacheHit = false;

  if (routeableDrivers.length > 0) {
    if (canUseCache && cached) {
      matrix = cached.matrix;
      cacheHit = true;
    } else {
      try {
        matrix = await computeTrafficAwareRouteMatrix(
          routeableDrivers.map((driver) => ({
            driverId: driver.id,
            latitude: Number(driver.latitude),
            longitude: Number(driver.longitude)
          })),
          {
            latitude: destinationLatitude,
            longitude: destinationLongitude
          }
        );
      } catch (error) {
        if (error instanceof RoutingPreviewUnavailableError) {
          res.status(503).json({
            success: false,
            code: error.code,
            message: error.message
          });
          return;
        }
        throw error;
      }

      routingPreviewCache.set(order.id, {
        key: cacheKey,
        expiresAtMs: now.getTime() + env.ROUTING_PREVIEW_CACHE_SECONDS * 1000,
        matrix
      });
    }
  }

  let pickupMatrix: MultiDestinationRouteMatrixResult[] = [];
  let pickupRoutingError: string | null = null;

  if (routeableDrivers.length > 0 && pickupStores.length > 0) {
    const pickupCacheKey = buildPickupRoutingCacheKey(
      order.id,
      routeableDrivers.map((driver) => driver.id),
      pickupStores
    );
    const cachedPickup = pickupRoutingMatrixCache.get(order.id);
    const canUsePickupCache =
      !forceRefresh &&
      cachedPickup?.key === pickupCacheKey &&
      cachedPickup.expiresAtMs > now.getTime();

    if (canUsePickupCache && cachedPickup) {
      pickupMatrix = cachedPickup.matrix;
    } else {
      try {
        pickupMatrix = await computeTrafficAwareRouteMatrixToDestinations(
          routeableDrivers.map((driver) => ({
            id: driver.id,
            latitude: Number(driver.latitude),
            longitude: Number(driver.longitude)
          })),
          pickupStores.map((store) => ({
            id: store.id,
            latitude: store.latitude,
            longitude: store.longitude
          }))
        );

        pickupRoutingMatrixCache.set(order.id, {
          key: pickupCacheKey,
          expiresAtMs:
            now.getTime() + env.ROUTING_PREVIEW_CACHE_SECONDS * 1000,
          matrix: pickupMatrix
        });
      } catch (error) {
        pickupRoutingError =
          error instanceof RoutingPreviewUnavailableError
            ? error.message
            : "Pickup-store routing is temporarily unavailable.";
      }
    }
  }

  const matrixByDriverId = new Map(
    matrix.map((result) => [result.driverId, result])
  );

  const formattedDrivers = onlineDrivers
    .map((driver) => {
      const matrixResult = matrixByDriverId.get(driver.id);
      const locationAvailable = routeableDriverIds.has(driver.id);
      const pickupRecommendations = locationAvailable
        ? selectPickupStoreRecommendations({
            driverId: driver.id,
            requiredPickupTypes,
            stores: pickupStores,
            matrix: pickupMatrix,
            generatedAt: now
          })
        : requiredPickupTypes.map((pickupType) => ({
            pickupType,
            unavailable: true as const
          }));

      return {
        driverId: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        email: driver.email,
        activeOrderCount: driver.assignedOrders.length,
        latitude: locationAvailable ? Number(driver.latitude) : null,
        longitude: locationAvailable ? Number(driver.longitude) : null,
        locationUpdatedAt: locationAvailable ? driver.locationUpdatedAt : null,
        locationAvailable,
        routeAvailable: matrixResult?.routeAvailable ?? false,
        etaMinutes: toMinutes(matrixResult?.durationSeconds ?? null),
        durationSeconds: matrixResult?.durationSeconds ?? null,
        distanceMeters: matrixResult?.distanceMeters ?? null,
        pickupRecommendations
      };
    })
    .sort((a, b) => {
      if (a.etaMinutes === null && b.etaMinutes === null) {
        return a.email.localeCompare(b.email);
      }
      if (a.etaMinutes === null) return 1;
      if (b.etaMinutes === null) return -1;
      return a.etaMinutes - b.etaMinutes;
    });

  const responseGeneratedAt = new Date();
  res.status(200).json({
    success: true,
    cached: cacheHit,
    cacheSeconds: env.ROUTING_PREVIEW_CACHE_SECONDS,
    generatedAt: responseGeneratedAt.toISOString(),
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      addressLine1: order.addressLine1,
      city: order.city,
      province: order.province,
      orderStatus: order.orderStatus,
      latitude: destinationLatitude,
      longitude: destinationLongitude
    },
    pickupRouting: {
      requiredPickupTypes,
      unknownItemCount,
      closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
      error: pickupRoutingError
    },
    fastestDriverId:
      formattedDrivers.find((driver) => driver.etaMinutes !== null)?.driverId ??
      null,
    drivers: formattedDrivers
  });
};
