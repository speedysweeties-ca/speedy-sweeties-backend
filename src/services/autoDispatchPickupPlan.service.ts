import { DispatchSource, OrderStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  getDriverFreshnessCutoff,
  isDriverLocationFresh
} from "../utils/driverFreshness";
import {
  computeTrafficAwareRouteMatrixToDestinations
} from "./multiDestinationRouteMatrix.service";
import {
  selectPickupStoreRecommendations,
  type PickupStoreCandidate,
  type PickupStoreRecommendation
} from "./pickupStoreRouting.service";
import { RoutingPreviewUnavailableError } from "./routingPreview.service";

const AUTO_DISPATCH_SETTING_KEY = "autoDispatchEnabled";
const AUTO_DISPATCH_ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.PLACED,
  OrderStatus.DISPATCHED,
  OrderStatus.ACCEPTED,
  OrderStatus.OUT_FOR_DELIVERY
];

const normalizePickupType = (value: string | null | undefined): string =>
  String(value || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";

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
    | "ORDER_CHANGED";
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

  return (recommendations as PickupStoreRecommendation[])
    .slice()
    .sort((a, b) => a.durationSeconds - b.durationSeconds)
    .map((recommendation, index) => ({
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
    }));
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

  const itemPickupTypes = order.items.map((item) =>
    normalizePickupType(item.itemCatalog?.pickupType)
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

  const stores = (await prisma.pickupLocation.findMany({
    where: {
      isActive: true,
      pickupType: { in: requiredPickupTypes }
    },
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
      manualHoursOverride: true
    },
    orderBy: [{ pickupType: "asc" }, { name: "asc" }]
  })) as PickupStoreCandidate[];

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
  const onlineDrivers = await prisma.user.findMany({
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
  });

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

  const driverWorkloads = await Promise.all(
    routeableDrivers.map(async (driver) => ({
      driver,
      activeOrderCount: await prisma.order.count({
        where: {
          assignedDriverId: driver.id,
          orderStatus: { in: AUTO_DISPATCH_ACTIVE_STATUSES }
        }
      })
    }))
  );

  driverWorkloads.sort((a, b) => {
    if (a.activeOrderCount !== b.activeOrderCount) {
      return a.activeOrderCount - b.activeOrderCount;
    }

    const aName = `${a.driver.firstName ?? ""} ${a.driver.lastName ?? ""}`.trim();
    const bName = `${b.driver.firstName ?? ""} ${b.driver.lastName ?? ""}`.trim();
    const nameCompare = aName.localeCompare(bName);
    if (nameCompare !== 0) return nameCompare;
    return a.driver.createdAt.getTime() - b.driver.createdAt.getTime();
  });

  let matrix;
  try {
    matrix = await computeTrafficAwareRouteMatrixToDestinations(
      routeableDrivers.map((driver) => ({
        id: driver.id,
        latitude: Number(driver.latitude),
        longitude: Number(driver.longitude)
      })),
      stores.map((store) => ({
        id: store.id,
        latitude: store.latitude,
        longitude: store.longitude
      }))
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

  let selected:
    | {
        driver: (typeof driverWorkloads)[number]["driver"];
        activeOrderCount: number;
        pickupStops: AutoDispatchPickupStop[];
      }
    | undefined;

  for (const workload of driverWorkloads) {
    const recommendations = selectPickupStoreRecommendations({
      driverId: workload.driver.id,
      requiredPickupTypes,
      stores,
      matrix,
      generatedAt: now
    });
    const pickupStops = orderPickupRecommendations(recommendations);

    if (pickupStops) {
      selected = {
        driver: workload.driver,
        activeOrderCount: workload.activeOrderCount,
        pickupStops
      };
      break;
    }
  }

  if (!selected) {
    console.warn(
      `[Auto Dispatch Pickup Plan] Order ${order.id} held: no online driver has a complete open-store pickup plan.`
    );
    return { dispatched: false, reason: "NO_COMPLETE_PICKUP_PLAN" };
  }

  const assignmentTime = new Date();
  const transactionResult = await prisma.$transaction(async (tx) => {
    if (isAutoDispatchHardDisabledByEnv()) return false;

    const setting = await tx.systemSetting.findUnique({
      where: { key: AUTO_DISPATCH_SETTING_KEY },
      select: { value: true }
    });
    if (!settingValueToBoolean(setting?.value)) return false;

    const assignmentUpdate = await tx.order.updateMany({
      where: {
        id: order.id,
        orderStatus: OrderStatus.PLACED,
        assignedDriverId: null
      },
      data: {
        assignedDriverId: selected.driver.id,
        assignedAt: assignmentTime,
        dispatchedAt: assignmentTime,
        dispatchedByUserId: null,
        dispatchSource: DispatchSource.AUTO,
        orderStatus: OrderStatus.DISPATCHED
      }
    });

    if (assignmentUpdate.count === 0) return false;

    await tx.orderPickupStop.deleteMany({ where: { orderId: order.id } });

    for (const stop of selected.pickupStops) {
      const store = stores.find((candidate) => candidate.id === stop.storeId);
      if (!store) throw new Error(`Pickup location ${stop.storeId} disappeared during assignment.`);

      await tx.orderPickupStop.create({
        data: {
          orderId: order.id,
          pickupLocationId: stop.storeId,
          pickupType: stop.pickupType,
          sequence: stop.sequence,
          plannedForDriverId: selected.driver.id,
          selectionSource: "AUTO",
          selectedAt: assignmentTime,
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

    return true;
  });

  if (!transactionResult) {
    return { dispatched: false, reason: "ORDER_CHANGED" };
  }

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
    pickupStops: selected.pickupStops
  };
};
