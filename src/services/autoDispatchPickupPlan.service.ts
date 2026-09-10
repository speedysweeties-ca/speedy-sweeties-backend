import { DispatchSource, OrderStatus, UserRole } from "@prisma/client";
import { normalizePickupTypeOrUnknown } from "../constants/pickupTypes";
import { prisma } from "../lib/prisma";
import {
  getDriverFreshnessCutoff,
  isDriverLocationFresh
} from "../utils/driverFreshness";
import {
  buildOrderTransitionTimestampData,
  evaluateOrderStatusTransition
} from "./orderStateTransition.service";
import {
  computeTrafficAwareRouteMatrixToDestinations
} from "./multiDestinationRouteMatrix.service";
import {
  hasValidPickupStoreCoordinates,
  pickupStoreRouteNodeId,
  selectSequentialPickupRoutePlan,
  type PickupStoreCandidate,
  type PickupStoreRecommendation
} from "./pickupStoreRouting.service";
import { RoutingPreviewUnavailableError } from "./routingPreview.service";
import { buildRoutablePickupLocationWhere } from "../utils/pickupLocationAvailability";

const AUTO_DISPATCH_SETTING_KEY = "autoDispatchEnabled";
export const AUTO_DISPATCH_ALLOCATION_LOCK_NAMESPACE = 20_260_909;
export const AUTO_DISPATCH_ALLOCATION_LOCK_KEY = 4;
const AUTO_DISPATCH_ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.PLACED,
  OrderStatus.DISPATCHED,
  OrderStatus.ACCEPTED,
  OrderStatus.OUT_FOR_DELIVERY
];

const isAutoDispatchHardDisabledByEnv = (): boolean => {
  const value = process.env.AUTO_DISPATCH_ENABLED;
  if (!value) return false;
  return ["false", "0", "off", "no"].includes(value.trim().toLowerCase());
};

const settingValueToBoolean = (value: string | null | undefined): boolean =>
  !value || value.trim().toLowerCase() !== "false";

const isAutoDispatchEnabled = async (): Promise<boolean> => {
  if (isAutoDispatchHardDisabledByEnv()) return false;

  const setting = await prisma.systemSetting.findUnique({
    where: { key: AUTO_DISPATCH_SETTING_KEY },
    select: { value: true }
  });

  return settingValueToBoolean(setting?.value);
};

export type AutoDispatchPickupStop = {
  pickupType: string;
  storeId: string;
  storeName: string;
  addressLine1: string;
  city: string;
  province: string;
  sequence: number;
  etaSeconds: number;
  distanceMeters: number | null;
  projectedArrivalAt: string;
  hoursSource: string;
  closingDate: string | null;
  closingTime: string | null;
  closingBufferMinutes: number;
};

export type AutoDispatchPickupPlanResult = {
  dispatched: boolean;
  reason:
    | "DISPATCHED"
    | "AUTO_DISPATCH_DISABLED"
    | "ORDER_NOT_ELIGIBLE"
    | "UNKNOWN_PICKUP_TYPE"
    | "NO_PICKUP_LOCATIONS"
    | "NO_ROUTEABLE_DRIVERS"
    | "NO_COMPLETE_PICKUP_PLAN"
    | "ROUTING_UNAVAILABLE"
    | "ORDER_CHANGED"
    | "ALLOCATION_UNAVAILABLE";
  driverId?: string;
  driverFcmToken?: string | null;
  driverIsOnline?: boolean;
  driverAppState?: string | null;
  orderNumber?: number;
  customerName?: string;
  addressLine1?: string;
  city?: string;
  pickupSummary?: string;
  pickupStops?: AutoDispatchPickupStop[];
  routeDurationSeconds?: number;
  routeEtaMinutes?: number;
};

export const shouldNotifyAutoDispatchedDriver = (
  result: AutoDispatchPickupPlanResult
): result is AutoDispatchPickupPlanResult & {
  dispatched: true;
  driverFcmToken: string;
  orderNumber: number;
  customerName: string;
  addressLine1: string;
} =>
  result.dispatched &&
  result.driverIsOnline === true &&
  Boolean(result.driverFcmToken) &&
  result.driverAppState !== "FOREGROUND" &&
  typeof result.orderNumber === "number" &&
  Boolean(result.customerName) &&
  Boolean(result.addressLine1);

type AutoDispatchDriver = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  isOnline: boolean;
  driverFcmToken: string | null;
  driverAppState: string | null;
  lastSeenAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  locationUpdatedAt: Date | null;
  createdAt: Date;
};

export type AutoDispatchAllocationCandidate = {
  driver: AutoDispatchDriver;
  activeOrderCount: number;
  pickupStops: AutoDispatchPickupStop[];
  routeDurationSeconds: number;
};

const compareDriverIdentity = (
  a: AutoDispatchDriver,
  b: AutoDispatchDriver
): number => {
  const aName = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
  const bName = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim();
  const nameCompare = aName.localeCompare(bName);
  if (nameCompare !== 0) return nameCompare;

  const emailCompare = a.email.localeCompare(b.email);
  if (emailCompare !== 0) return emailCompare;
  return a.id.localeCompare(b.id);
};

export const selectAutoDispatchAllocationCandidate = (
  candidates: AutoDispatchAllocationCandidate[]
): AutoDispatchAllocationCandidate | null => {
  const sortedCandidates = candidates.slice().sort((a, b) => {
    if (a.activeOrderCount !== b.activeOrderCount) {
      return a.activeOrderCount - b.activeOrderCount;
    }

    if (a.routeDurationSeconds !== b.routeDurationSeconds) {
      return a.routeDurationSeconds - b.routeDurationSeconds;
    }

    return compareDriverIdentity(a.driver, b.driver);
  });

  return sortedCandidates[0] ?? null;
};

type AutoDispatchAllocationResult =
  | {
      selected: AutoDispatchAllocationCandidate;
      reason: "DISPATCHED";
    }
  | {
      selected: null;
      reason: Exclude<AutoDispatchPickupPlanResult["reason"], "DISPATCHED">;
    };

export const orderPickupRecommendations = (
  recommendations: Array<
    PickupStoreRecommendation | { pickupType: string; unavailable: true }
  >
): AutoDispatchPickupStop[] | null => {
  if (
    recommendations.some(
      (recommendation) => "unavailable" in recommendation
    )
  ) {
    return null;
  }

  return (recommendations as PickupStoreRecommendation[]).map(
    (recommendation, index) => ({
      pickupType: recommendation.pickupType,
      storeId: recommendation.storeId,
      storeName: recommendation.storeName,
      addressLine1: recommendation.addressLine1,
      city: recommendation.city,
      province: recommendation.province,
      sequence: index + 1,
      etaSeconds: recommendation.durationSeconds,
      distanceMeters: recommendation.distanceMeters,
      projectedArrivalAt: recommendation.projectedArrivalAt,
      hoursSource: recommendation.hoursSource,
      closingDate: recommendation.closingDate,
      closingTime: recommendation.closingTime,
      closingBufferMinutes: recommendation.closingBufferMinutes
    })
  );
};

export const autoDispatchCreatedOrderWithPickupPlan = async (
  orderId: string
): Promise<AutoDispatchPickupPlanResult> => {
  if (!(await isAutoDispatchEnabled())) {
    return { dispatched: false, reason: "AUTO_DISPATCH_DISABLED" };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      orderStatus: true,
      assignedDriverId: true,
      customerName: true,
      addressLine1: true,
      city: true,
      deliveryLatitude: true,
      deliveryLongitude: true,
      geocodeStatus: true,
      items: {
        select: {
          itemCatalog: {
            select: { pickupType: true }
          }
        }
      }
    }
  });

  if (
    !order ||
    order.orderStatus !== OrderStatus.PLACED ||
    order.assignedDriverId !== null
  ) {
    return { dispatched: false, reason: "ORDER_NOT_ELIGIBLE" };
  }

  const hasStoredDeliveryCoordinates =
    order.deliveryLatitude !== null && order.deliveryLongitude !== null;
  const deliveryLatitude = hasStoredDeliveryCoordinates
    ? Number(order.deliveryLatitude)
    : Number.NaN;
  const deliveryLongitude = hasStoredDeliveryCoordinates
    ? Number(order.deliveryLongitude)
    : Number.NaN;
  const hasVerifiedDeliveryLocation =
    order.geocodeStatus === "VERIFIED" &&
    hasStoredDeliveryCoordinates &&
    Number.isFinite(deliveryLatitude) &&
    Number.isFinite(deliveryLongitude);
  if (!hasVerifiedDeliveryLocation) {
    console.warn(
      `[Auto Dispatch Pickup Plan] Order ${order.id} held: delivery location is unavailable for complete pickup routing.`
    );
    return { dispatched: false, reason: "ROUTING_UNAVAILABLE" };
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

  if (unknownItemCount > 0 || requiredPickupTypes.length === 0) {
    console.log(
      `[Auto Dispatch Pickup Plan] Order ${order.id} held for dispatcher review: ${unknownItemCount} unknown pickup item(s).`
    );
    return { dispatched: false, reason: "UNKNOWN_PICKUP_TYPE" };
  }

  const stores = ((await prisma.pickupLocation.findMany({
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
      isActive: true,
      routingPriority: true,
      googleBusinessStatus: true,
      regularOpeningHours: true,
      currentOpeningHours: true,
      manualHoursOverride: true
    },
    orderBy: [{ pickupType: "asc" }, { name: "asc" }]
  })) as PickupStoreCandidate[]).filter(hasValidPickupStoreCoordinates);

  const availableStoreTypes = new Set(stores.map((store) => store.pickupType));
  if (
    requiredPickupTypes.some((pickupType) => !availableStoreTypes.has(pickupType))
  ) {
    console.warn(
      `[Auto Dispatch Pickup Plan] Order ${order.id} held: at least one required pickup type has no active pickup location.`
    );
    return { dispatched: false, reason: "NO_PICKUP_LOCATIONS" };
  }

  const now = new Date();
  const freshnessCutoff = getDriverFreshnessCutoff(now);
  const onlineDrivers = (await prisma.user.findMany({
    where: {
      role: UserRole.DRIVER,
      isActive: true,
      isVisibleInDispatch: true,
      isOnline: true,
      lastSeenAt: { gte: freshnessCutoff }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      isOnline: true,
      driverFcmToken: true,
      driverAppState: true,
      lastSeenAt: true,
      latitude: true,
      longitude: true,
      locationUpdatedAt: true,
      createdAt: true
    }
  })) as AutoDispatchDriver[];

  const routeableDrivers = onlineDrivers.filter((driver) => {
    if (driver.latitude === null || driver.longitude === null) return false;
    return (
      Number.isFinite(Number(driver.latitude)) &&
      Number.isFinite(Number(driver.longitude)) &&
      isDriverLocationFresh(driver.lastSeenAt, driver.locationUpdatedAt, now)
    );
  });

  if (routeableDrivers.length === 0) {
    console.log(
      `[Auto Dispatch Pickup Plan] Order ${order.id} held: no online driver has fresh GPS.`
    );
    return { dispatched: false, reason: "NO_ROUTEABLE_DRIVERS" };
  }

  const plannedDriverRouteSources = new Map(
    routeableDrivers.map((driver) => [
      driver.id,
      {
        latitude: Number(driver.latitude),
        longitude: Number(driver.longitude),
        locationUpdatedAtMs: driver.locationUpdatedAt?.getTime() ?? null
      }
    ])
  );

  let matrix;
  try {
    const customerRouteNodeId = `customer:${order.id}`;
    const driverRoutePoints = routeableDrivers.map((driver) => ({
      id: `driver:${driver.id}`,
      latitude: Number(driver.latitude),
      longitude: Number(driver.longitude)
    }));
    const storeRoutePoints = stores.map((store) => ({
      id: pickupStoreRouteNodeId(store.id),
      latitude: store.latitude,
      longitude: store.longitude
    }));

    matrix = await computeTrafficAwareRouteMatrixToDestinations(
      [...driverRoutePoints, ...storeRoutePoints],
      [
        ...storeRoutePoints,
        {
          id: customerRouteNodeId,
          latitude: deliveryLatitude,
          longitude: deliveryLongitude
        }
      ]
    );
  } catch (error) {
    console.error(
      `[Auto Dispatch Pickup Plan] Order ${order.id} held: pickup routing unavailable.`,
      error instanceof RoutingPreviewUnavailableError
        ? error.message
        : error instanceof Error
          ? error.name
          : typeof error
    );
    return { dispatched: false, reason: "ROUTING_UNAVAILABLE" };
  }

  let allocationResult: AutoDispatchAllocationResult;
  try {
    allocationResult = await prisma.$transaction<AutoDispatchAllocationResult>(
      async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(
            ${AUTO_DISPATCH_ALLOCATION_LOCK_NAMESPACE},
            ${AUTO_DISPATCH_ALLOCATION_LOCK_KEY}
          )
        `;

        if (isAutoDispatchHardDisabledByEnv()) {
          return { selected: null, reason: "AUTO_DISPATCH_DISABLED" };
        }

        const setting = await tx.systemSetting.findUnique({
          where: { key: AUTO_DISPATCH_SETTING_KEY },
          select: { value: true }
        });
        if (!settingValueToBoolean(setting?.value)) {
          return { selected: null, reason: "AUTO_DISPATCH_DISABLED" };
        }

        const lockedOrders = await tx.$queryRaw<
          Array<{
            id: string;
            orderStatus: OrderStatus;
            assignedDriverId: string | null;
            assignedAt: Date | null;
            dispatchedAt: Date | null;
            acceptedAt: Date | null;
            outForDeliveryAt: Date | null;
            deliveredAt: Date | null;
          }>
        >`
          SELECT
            "id",
            "orderStatus",
            "assignedDriverId",
            "assignedAt",
            "dispatchedAt",
            "acceptedAt",
            "outForDeliveryAt",
            "deliveredAt"
          FROM "Order"
          WHERE "id" = ${order.id}
          FOR UPDATE
        `;
        const lockedOrder = lockedOrders[0];
        if (
          !lockedOrder ||
          lockedOrder.orderStatus !== OrderStatus.PLACED ||
          lockedOrder.assignedDriverId !== null
        ) {
          return { selected: null, reason: "ORDER_CHANGED" };
        }

        const transition = evaluateOrderStatusTransition({
          actor: "AUTO_DISPATCH",
          currentStatus: lockedOrder.orderStatus,
          targetStatus: OrderStatus.DISPATCHED
        });
        if (!transition.allowed) {
          return { selected: null, reason: "ORDER_CHANGED" };
        }

        const allocationTime = new Date();
        const currentDrivers = (await tx.user.findMany({
          where: {
            role: UserRole.DRIVER,
            isActive: true,
            isVisibleInDispatch: true,
            isOnline: true,
            lastSeenAt: { gte: getDriverFreshnessCutoff(allocationTime) }
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            isOnline: true,
            driverFcmToken: true,
            driverAppState: true,
            lastSeenAt: true,
            latitude: true,
            longitude: true,
            locationUpdatedAt: true,
            createdAt: true
          }
        })) as AutoDispatchDriver[];

        const currentRouteableDrivers = currentDrivers.filter((driver) => {
          const plannedRouteSource = plannedDriverRouteSources.get(driver.id);
          if (
            !plannedRouteSource ||
            driver.latitude === null ||
            driver.longitude === null ||
            !Number.isFinite(Number(driver.latitude)) ||
            !Number.isFinite(Number(driver.longitude)) ||
            !isDriverLocationFresh(
              driver.lastSeenAt,
              driver.locationUpdatedAt,
              allocationTime
            )
          ) {
            return false;
          }

          return (
            Number(driver.latitude) === plannedRouteSource.latitude &&
            Number(driver.longitude) === plannedRouteSource.longitude &&
            (driver.locationUpdatedAt?.getTime() ?? null) ===
              plannedRouteSource.locationUpdatedAtMs
          );
        });

        if (currentRouteableDrivers.length === 0) {
          return { selected: null, reason: "NO_ROUTEABLE_DRIVERS" };
        }

        const candidates = (
          await Promise.all(
            currentRouteableDrivers.map(async (driver) => {
              const routePlan = selectSequentialPickupRoutePlan({
                driverRouteNodeId: `driver:${driver.id}`,
                customerRouteNodeId: `customer:${order.id}`,
                requiredPickupTypes,
                stores,
                matrix,
                generatedAt: allocationTime
              });
              const pickupStops = routePlan
                ? orderPickupRecommendations(routePlan.pickupStops)
                : null;
              if (!pickupStops || !routePlan) return null;

              const activeOrderCount = await tx.order.count({
                where: {
                  assignedDriverId: driver.id,
                  orderStatus: { in: AUTO_DISPATCH_ACTIVE_STATUSES }
                }
              });

              return {
                driver,
                activeOrderCount,
                pickupStops,
                routeDurationSeconds: routePlan.totalDurationSeconds
              };
            })
          )
        ).filter(
          (candidate): candidate is AutoDispatchAllocationCandidate =>
            candidate !== null
        );
        const selected = selectAutoDispatchAllocationCandidate(candidates);
        if (!selected) {
          return { selected: null, reason: "NO_COMPLETE_PICKUP_PLAN" };
        }

        const assignmentUpdate = await tx.order.updateMany({
          where: {
            id: order.id,
            orderStatus: OrderStatus.PLACED,
            assignedDriverId: null
          },
          data: {
            assignedDriverId: selected.driver.id,
            assignedAt: allocationTime,
            ...buildOrderTransitionTimestampData(
              lockedOrder,
              OrderStatus.DISPATCHED,
              allocationTime
            ),
            dispatchedByUserId: null,
            dispatchSource: DispatchSource.AUTO,
            orderStatus: OrderStatus.DISPATCHED
          }
        });

        if (assignmentUpdate.count === 0) {
          return { selected: null, reason: "ORDER_CHANGED" };
        }

        await tx.orderPickupStop.deleteMany({ where: { orderId: order.id } });

        for (const stop of selected.pickupStops) {
          const store = stores.find((candidate) => candidate.id === stop.storeId);
          if (!store) {
            throw new Error(`Pickup location ${stop.storeId} disappeared during assignment.`);
          }

          await tx.orderPickupStop.create({
            data: {
              orderId: order.id,
              pickupLocationId: stop.storeId,
              pickupType: stop.pickupType,
              sequence: stop.sequence,
              plannedForDriverId: selected.driver.id,
              selectionSource: "AUTO",
              selectedAt: allocationTime,
              etaSeconds: stop.etaSeconds,
              distanceMeters: stop.distanceMeters,
              projectedArrivalAt: new Date(stop.projectedArrivalAt),
              hoursSource: stop.hoursSource,
              closingDate: stop.closingDate,
              closingTime: stop.closingTime,
              closingBufferMinutes: stop.closingBufferMinutes,
              storeName: store.name,
              addressLine1: store.addressLine1,
              city: store.city,
              province: store.province,
              latitude: store.latitude,
              longitude: store.longitude
            }
          });
        }

        return { selected, reason: "DISPATCHED" };
      }
    );
  } catch (error) {
    console.error(
      `[Auto Dispatch Pickup Plan] Order ${order.id} held: allocation transaction unavailable.`,
      error instanceof Error ? error.name : typeof error
    );
    return { dispatched: false, reason: "ALLOCATION_UNAVAILABLE" };
  }

  if (!allocationResult.selected) {
    return { dispatched: false, reason: allocationResult.reason };
  }

  const selected = allocationResult.selected;

  const pickupSummary = selected.pickupStops
    .map((stop) => stop.storeName)
    .join(" → ");

  console.log(
    `[Auto Dispatch Pickup Plan] Order ${order.id} dispatched to driver ${selected.driver.id} with ${selected.pickupStops.length} persisted pickup stop(s): ${pickupSummary}.`
  );

  return {
    dispatched: true,
    reason: "DISPATCHED",
    driverId: selected.driver.id,
    driverFcmToken: selected.driver.driverFcmToken,
    driverIsOnline: selected.driver.isOnline,
    driverAppState: selected.driver.driverAppState,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    addressLine1: order.addressLine1,
    city: order.city,
    pickupSummary,
    pickupStops: selected.pickupStops,
    routeDurationSeconds: selected.routeDurationSeconds,
    routeEtaMinutes: Math.max(1, Math.round(selected.routeDurationSeconds / 60))
  };
};
