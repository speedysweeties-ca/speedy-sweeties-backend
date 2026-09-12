import {
  DispatchEventType,
  DispatchSource,
  OrderStatus,
  UserRole
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  getDriverFreshnessCutoff,
  isDriverLocationFresh
} from "../utils/driverFreshness";
import {
  buildOrderTransitionTimestampData,
  evaluateOrderStatusTransition
} from "./orderStateTransition.service";
import { computeTrafficAwareRouteMatrixToDestinations } from "./multiDestinationRouteMatrix.service";
import { RoutingPreviewUnavailableError } from "./routingPreview.service";
import { recordDispatchEventBestEffort } from "./dispatcherPerformanceTracking.service";

const AUTO_DISPATCH_SETTING_KEY = "autoDispatchEnabled";

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

export type AutoDispatchPickupPlanResult = {
  dispatched: boolean;
  reason:
    | "DISPATCHED"
    | "AUTO_DISPATCH_DISABLED"
    | "ORDER_NOT_ELIGIBLE"
    | "NO_ROUTEABLE_DRIVERS"
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
  pickupStops?: [];
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
  routeDurationSeconds: number;
  routeDistanceMeters: number | null;
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
    if (a.routeDurationSeconds !== b.routeDurationSeconds) {
      return a.routeDurationSeconds - b.routeDurationSeconds;
    }

    if (
      a.routeDistanceMeters !== null &&
      b.routeDistanceMeters !== null &&
      a.routeDistanceMeters !== b.routeDistanceMeters
    ) {
      return a.routeDistanceMeters - b.routeDistanceMeters;
    }

    if (a.routeDistanceMeters !== null && b.routeDistanceMeters === null) {
      return -1;
    }
    if (a.routeDistanceMeters === null && b.routeDistanceMeters !== null) {
      return 1;
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

/**
 * Assigns a newly created order to the online driver with fresh GPS whose
 * traffic-aware direct drive to the customer's address is shortest.
 *
 * The legacy function name is retained because the order controller already
 * calls it. Item pickup types and pickup locations intentionally do not take
 * part in this assignment decision.
 */
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
      geocodeStatus: true
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
      `[Auto Dispatch] Order ${order.id} held: the delivery address has no verified coordinates.`
    );
    return { dispatched: false, reason: "ROUTING_UNAVAILABLE" };
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
      `[Auto Dispatch] Order ${order.id} held: no online driver has fresh GPS.`
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

  const customerRouteNodeId = `customer:${order.id}`;
  const directRoutesByDriverId = new Map<
    string,
    { durationSeconds: number; distanceMeters: number | null }
  >();

  try {
    const matrix = await computeTrafficAwareRouteMatrixToDestinations(
      routeableDrivers.map((driver) => ({
        id: `driver:${driver.id}`,
        latitude: Number(driver.latitude),
        longitude: Number(driver.longitude)
      })),
      [
        {
          id: customerRouteNodeId,
          latitude: deliveryLatitude,
          longitude: deliveryLongitude
        }
      ]
    );

    for (const route of matrix) {
      if (
        route.destinationId !== customerRouteNodeId ||
        !route.originId.startsWith("driver:") ||
        !route.routeAvailable ||
        route.durationSeconds === null
      ) {
        continue;
      }

      directRoutesByDriverId.set(route.originId.slice("driver:".length), {
        durationSeconds: route.durationSeconds,
        distanceMeters: route.distanceMeters
      });
    }
  } catch (error) {
    console.error(
      `[Auto Dispatch] Order ${order.id} held: direct driver routing unavailable.`,
      error instanceof RoutingPreviewUnavailableError
        ? error.message
        : error instanceof Error
          ? error.name
          : typeof error
    );
    return { dispatched: false, reason: "ROUTING_UNAVAILABLE" };
  }

  if (directRoutesByDriverId.size === 0) {
    console.warn(
      `[Auto Dispatch] Order ${order.id} held: no driver has a route to the delivery address.`
    );
    return { dispatched: false, reason: "ROUTING_UNAVAILABLE" };
  }

  let allocationResult: AutoDispatchAllocationResult;
  try {
    allocationResult = await prisma.$transaction<AutoDispatchAllocationResult>(
      async (tx) => {
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

        const candidates = currentDrivers.flatMap((driver) => {
          const plannedRouteSource = plannedDriverRouteSources.get(driver.id);
          const directRoute = directRoutesByDriverId.get(driver.id);
          if (
            !plannedRouteSource ||
            !directRoute ||
            driver.latitude === null ||
            driver.longitude === null ||
            !Number.isFinite(Number(driver.latitude)) ||
            !Number.isFinite(Number(driver.longitude)) ||
            !isDriverLocationFresh(
              driver.lastSeenAt,
              driver.locationUpdatedAt,
              allocationTime
            ) ||
            Number(driver.latitude) !== plannedRouteSource.latitude ||
            Number(driver.longitude) !== plannedRouteSource.longitude ||
            (driver.locationUpdatedAt?.getTime() ?? null) !==
              plannedRouteSource.locationUpdatedAtMs
          ) {
            return [];
          }

          return [
            {
              driver,
              routeDurationSeconds: directRoute.durationSeconds,
              routeDistanceMeters: directRoute.distanceMeters
            }
          ];
        });

        const selected = selectAutoDispatchAllocationCandidate(candidates);
        if (!selected) {
          return { selected: null, reason: "NO_ROUTEABLE_DRIVERS" };
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

        // Auto-dispatch no longer persists an item-derived pickup plan.
        await tx.orderPickupStop.deleteMany({ where: { orderId: order.id } });

        return { selected, reason: "DISPATCHED" };
      }
    );
  } catch (error) {
    console.error(
      `[Auto Dispatch] Order ${order.id} held: allocation transaction unavailable.`,
      error instanceof Error ? `${error.name}: ${error.message}` : typeof error
    );
    return { dispatched: false, reason: "ALLOCATION_UNAVAILABLE" };
  }

  if (!allocationResult.selected) {
    return { dispatched: false, reason: allocationResult.reason };
  }

  const selected = allocationResult.selected;

  await recordDispatchEventBestEffort({
    orderId: order.id,
    eventType: DispatchEventType.ASSIGNED,
    dispatchSource: DispatchSource.AUTO,
    actorUserId: null,
    fromDriverId: null,
    toDriverId: selected.driver.id
  });

  console.log(
    `[Auto Dispatch] Order ${order.id} dispatched to closest driver ${selected.driver.id}; direct ETA ${selected.routeDurationSeconds} second(s).`
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
    pickupStops: [],
    routeDurationSeconds: selected.routeDurationSeconds,
    routeEtaMinutes: Math.max(1, Math.round(selected.routeDurationSeconds / 60))
  };
};
