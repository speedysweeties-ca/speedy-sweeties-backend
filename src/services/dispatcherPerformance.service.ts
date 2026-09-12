import {
  DispatchEventType,
  DispatchSource,
  OrderSource,
  OrderStatus,
  UserRole
} from "@prisma/client";
import { formatTorontoDateKey } from "./growthDashboard.service";

export type DispatcherPerformanceSourceGroup =
  | "APP"
  | "ONLINE"
  | "MANUAL"
  | "UNKNOWN";

export type DispatcherPerformanceUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  isActive: boolean;
};

export type DispatcherPerformanceOrder = {
  id: string;
  orderNumber: number;
  orderStatus: OrderStatus;
  orderSource: OrderSource;
  dispatchSource: DispatchSource | null;
  createdAt: Date;
  manualEntryStartedAt: Date | null;
  createdByUserId: string | null;
  dispatchedAt: Date | null;
  dispatchedByUserId: string | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
};

export type DispatcherPerformanceEvent = {
  orderId: string;
  eventType: DispatchEventType;
  dispatchSource: DispatchSource;
  actorUserId: string | null;
  occurredAt: Date;
};

type DurationBreakdown = {
  totalOrders: number;
  averageDispatchMinutes: number | null;
  medianDispatchMinutes: number | null;
  p90DispatchMinutes: number | null;
  withinFiveMinutesPercent: number | null;
};

type DispatcherAccumulator = {
  dispatcher: DispatcherPerformanceUser;
  manualOrdersCreated: number;
  manualEntryMinutes: number[];
  dispatchedOrders: DispatcherPerformanceOrder[];
  assignmentActions: number;
  reassignments: number;
  unassignments: number;
};

const SOURCE_GROUPS: DispatcherPerformanceSourceGroup[] = [
  "APP",
  "ONLINE",
  "MANUAL",
  "UNKNOWN"
];

const round = (value: number, digits = 1): number => {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
};

const minutesBetween = (start: Date | null, end: Date | null): number | null => {
  if (!start || !end) return null;
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
};

const average = (values: number[]): number | null => {
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const percentile = (values: number[], fraction: number): number | null => {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(fraction * sorted.length) - 1);
  return round(sorted[index]);
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? round((sorted[middle - 1] + sorted[middle]) / 2)
    : round(sorted[middle]);
};

const percentage = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return round((numerator / denominator) * 100);
};

export const getDispatcherPerformanceSourceGroup = (
  orderSource: OrderSource
): DispatcherPerformanceSourceGroup => {
  if (
    orderSource === OrderSource.ANDROID_APP ||
    orderSource === OrderSource.IOS_APP
  ) {
    return "APP";
  }
  if (orderSource === OrderSource.WEBFLOW) return "ONLINE";
  if (orderSource === OrderSource.DISPATCHER_MANUAL) return "MANUAL";
  return "UNKNOWN";
};

const buildDurationBreakdown = (
  orders: DispatcherPerformanceOrder[]
): DurationBreakdown => {
  const dispatchMinutes = orders.flatMap((order) => {
    const minutes = minutesBetween(order.createdAt, order.dispatchedAt);
    return minutes === null ? [] : [minutes];
  });

  return {
    totalOrders: orders.length,
    averageDispatchMinutes: average(dispatchMinutes),
    medianDispatchMinutes: median(dispatchMinutes),
    p90DispatchMinutes: percentile(dispatchMinutes, 0.9),
    withinFiveMinutesPercent: percentage(
      dispatchMinutes.filter((minutes) => minutes <= 5).length,
      dispatchMinutes.length
    )
  };
};

const displayName = (dispatcher: DispatcherPerformanceUser): string => {
  const name = [dispatcher.firstName, dispatcher.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || "Unnamed dispatcher";
};

const buildSourceBreakdown = (orders: DispatcherPerformanceOrder[]) => {
  return SOURCE_GROUPS.map((sourceGroup) => ({
    sourceGroup,
    ...buildDurationBreakdown(
      orders.filter(
        (order) => getDispatcherPerformanceSourceGroup(order.orderSource) === sourceGroup
      )
    )
  }));
};

const buildFirstDispatchOrders = (input: {
  orders: DispatcherPerformanceOrder[];
  events: DispatcherPerformanceEvent[];
}): DispatcherPerformanceOrder[] => {
  const firstAssignmentByOrderId = new Map<string, DispatcherPerformanceEvent>();

  for (const event of input.events) {
    if (event.eventType !== DispatchEventType.ASSIGNED) continue;

    const current = firstAssignmentByOrderId.get(event.orderId);
    if (!current || event.occurredAt.getTime() < current.occurredAt.getTime()) {
      firstAssignmentByOrderId.set(event.orderId, event);
    }
  }

  return input.orders.flatMap((order) => {
    const firstAssignment = firstAssignmentByOrderId.get(order.id);

    if (firstAssignment) {
      if (
        firstAssignment.dispatchSource !== DispatchSource.MANUAL ||
        !firstAssignment.actorUserId
      ) {
        return [];
      }

      return [
        {
          ...order,
          dispatchSource: DispatchSource.MANUAL,
          dispatchedByUserId: firstAssignment.actorUserId,
          dispatchedAt: firstAssignment.occurredAt
        }
      ];
    }

    return order.dispatchSource === DispatchSource.MANUAL &&
      order.dispatchedByUserId
      ? [order]
      : [];
  });
};

export const buildDispatcherPerformance = (input: {
  dispatchers: DispatcherPerformanceUser[];
  orders: DispatcherPerformanceOrder[];
  events: DispatcherPerformanceEvent[];
  selectedDispatcherIds?: string[];
}) => {
  const firstDispatchOrders = buildFirstDispatchOrders(input);
  const requestedIds = new Set(input.selectedDispatcherIds ?? []);
  const selectedDispatchers = input.dispatchers.filter(
    (dispatcher) => requestedIds.size === 0 || requestedIds.has(dispatcher.id)
  );
  const selectedIds = new Set(selectedDispatchers.map((dispatcher) => dispatcher.id));
  const accumulators = new Map<string, DispatcherAccumulator>(
    selectedDispatchers.map((dispatcher) => [
      dispatcher.id,
      {
        dispatcher,
        manualOrdersCreated: 0,
        manualEntryMinutes: [] as number[],
        dispatchedOrders: [] as DispatcherPerformanceOrder[],
        assignmentActions: 0,
        reassignments: 0,
        unassignments: 0
      }
    ])
  );

  for (const order of input.orders) {
    if (
      order.orderSource === OrderSource.DISPATCHER_MANUAL &&
      order.createdByUserId &&
      selectedIds.has(order.createdByUserId)
    ) {
      const accumulator = accumulators.get(order.createdByUserId);
      if (accumulator) {
        accumulator.manualOrdersCreated += 1;
        const entryMinutes = minutesBetween(
          order.manualEntryStartedAt,
          order.createdAt
        );
        if (entryMinutes !== null) accumulator.manualEntryMinutes.push(entryMinutes);
      }
    }

  }

  for (const order of firstDispatchOrders) {
    if (!order.dispatchedByUserId || !selectedIds.has(order.dispatchedByUserId)) {
      continue;
    }
    accumulators.get(order.dispatchedByUserId)?.dispatchedOrders.push(order);
  }

  for (const event of input.events) {
    if (
      event.dispatchSource !== DispatchSource.MANUAL ||
      !event.actorUserId ||
      !selectedIds.has(event.actorUserId)
    ) {
      continue;
    }

    const accumulator = accumulators.get(event.actorUserId);
    if (!accumulator) continue;

    if (
      event.eventType === DispatchEventType.ASSIGNED ||
      event.eventType === DispatchEventType.REASSIGNED
    ) {
      accumulator.assignmentActions += 1;
    }
    if (event.eventType === DispatchEventType.REASSIGNED) {
      accumulator.reassignments += 1;
    }
    if (event.eventType === DispatchEventType.UNASSIGNED) {
      accumulator.unassignments += 1;
    }
  }

  const selectedDispatchedOrders = firstDispatchOrders.filter(
    (order) =>
      Boolean(order.dispatchedByUserId) &&
      selectedIds.has(order.dispatchedByUserId ?? "")
  );
  const selectedManualOrders = input.orders.filter(
    (order) =>
      order.orderSource === OrderSource.DISPATCHER_MANUAL &&
      Boolean(order.createdByUserId) &&
      selectedIds.has(order.createdByUserId ?? "")
  );
  const selectedEvents = input.events.filter(
    (event) =>
      event.dispatchSource === DispatchSource.MANUAL &&
      Boolean(event.actorUserId) &&
      selectedIds.has(event.actorUserId ?? "")
  );

  const stats = Array.from(accumulators.values())
    .map((accumulator) => {
      const dispatchDurations = buildDurationBreakdown(
        accumulator.dispatchedOrders
      );
      const deliveredOrders = accumulator.dispatchedOrders.filter(
        (order) => order.orderStatus === OrderStatus.DELIVERED && order.deliveredAt
      );
      const totalDeliveryMinutes = deliveredOrders.flatMap((order) => {
        const minutes = minutesBetween(order.createdAt, order.deliveredAt);
        return minutes === null ? [] : [minutes];
      });
      const postDispatchDeliveryMinutes = deliveredOrders.flatMap((order) => {
        const minutes = minutesBetween(order.dispatchedAt, order.deliveredAt);
        return minutes === null ? [] : [minutes];
      });

      return {
        dispatcherId: accumulator.dispatcher.id,
        firstName: accumulator.dispatcher.firstName,
        lastName: accumulator.dispatcher.lastName,
        displayName: displayName(accumulator.dispatcher),
        role: accumulator.dispatcher.role,
        isActive: accumulator.dispatcher.isActive,
        manualOrdersCreated: accumulator.manualOrdersCreated,
        manualEntryTimeSamples: accumulator.manualEntryMinutes.length,
        averageManualEntryMinutes: average(accumulator.manualEntryMinutes),
        ordersDispatched: dispatchDurations.totalOrders,
        dispatchTimeSamples: accumulator.dispatchedOrders.filter(
          (order) => minutesBetween(order.createdAt, order.dispatchedAt) !== null
        ).length,
        averageDispatchMinutes: dispatchDurations.averageDispatchMinutes,
        medianDispatchMinutes: dispatchDurations.medianDispatchMinutes,
        p90DispatchMinutes: dispatchDurations.p90DispatchMinutes,
        withinFiveMinutesPercent: dispatchDurations.withinFiveMinutesPercent,
        deliveredOrders: deliveredOrders.length,
        averageTotalDeliveryMinutes: average(totalDeliveryMinutes),
        averagePostDispatchDeliveryMinutes: average(postDispatchDeliveryMinutes),
        cancelledOrders: accumulator.dispatchedOrders.filter(
          (order) => order.orderStatus === OrderStatus.CANCELLED
        ).length,
        assignmentActions: accumulator.assignmentActions,
        reassignments: accumulator.reassignments,
        unassignments: accumulator.unassignments,
        sourceBreakdown: buildSourceBreakdown(accumulator.dispatchedOrders)
      };
    })
    .sort(
      (a, b) =>
        b.ordersDispatched - a.ordersDispatched ||
        b.manualOrdersCreated - a.manualOrdersCreated ||
        a.displayName.localeCompare(b.displayName)
    );

  const totalDeliveryMinutes = selectedDispatchedOrders.flatMap((order) => {
    if (order.orderStatus !== OrderStatus.DELIVERED) return [];
    const minutes = minutesBetween(order.createdAt, order.deliveredAt);
    return minutes === null ? [] : [minutes];
  });
  const postDispatchDeliveryMinutes = selectedDispatchedOrders.flatMap((order) => {
    if (order.orderStatus !== OrderStatus.DELIVERED) return [];
    const minutes = minutesBetween(order.dispatchedAt, order.deliveredAt);
    return minutes === null ? [] : [minutes];
  });
  const manualEntryMinutes = selectedManualOrders.flatMap((order) => {
    const minutes = minutesBetween(order.manualEntryStartedAt, order.createdAt);
    return minutes === null ? [] : [minutes];
  });
  const dispatchSummary = buildDurationBreakdown(selectedDispatchedOrders);

  const orderDetails = selectedDispatchedOrders
    .map((order) => {
      const dispatchMinutes = minutesBetween(order.createdAt, order.dispatchedAt);

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        dispatcherId: order.dispatchedByUserId,
        orderStatus: order.orderStatus,
        orderSource: order.orderSource,
        sourceGroup: getDispatcherPerformanceSourceGroup(order.orderSource),
        createdAt: order.createdAt,
        dispatchedAt: order.dispatchedAt,
        dispatchMinutes,
        withinFiveMinutes:
          dispatchMinutes === null ? null : dispatchMinutes <= 5,
        deliveredAt: order.deliveredAt,
        totalDeliveryMinutes: minutesBetween(order.createdAt, order.deliveredAt),
        postDispatchDeliveryMinutes: minutesBetween(
          order.dispatchedAt,
          order.deliveredAt
        )
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const dailyGroups = new Map<string, DispatcherPerformanceOrder[]>();
  for (const order of selectedDispatchedOrders) {
    const date = formatTorontoDateKey(order.createdAt);
    const existing = dailyGroups.get(date) ?? [];
    existing.push(order);
    dailyGroups.set(date, existing);
  }

  const dailyTrend = Array.from(dailyGroups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, orders]) => ({ date, ...buildDurationBreakdown(orders) }));

  return {
    dispatchers: input.dispatchers
      .map((dispatcher) => ({
        dispatcherId: dispatcher.id,
        firstName: dispatcher.firstName,
        lastName: dispatcher.lastName,
        displayName: displayName(dispatcher),
        role: dispatcher.role,
        isActive: dispatcher.isActive
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    selectedDispatcherIds: Array.from(selectedIds),
    summary: {
      manualOrdersCreated: selectedManualOrders.length,
      manualEntryTimeSamples: manualEntryMinutes.length,
      averageManualEntryMinutes: average(manualEntryMinutes),
      ordersDispatched: dispatchSummary.totalOrders,
      dispatchTimeSamples: selectedDispatchedOrders.filter(
        (order) => minutesBetween(order.createdAt, order.dispatchedAt) !== null
      ).length,
      averageDispatchMinutes: dispatchSummary.averageDispatchMinutes,
      medianDispatchMinutes: dispatchSummary.medianDispatchMinutes,
      p90DispatchMinutes: dispatchSummary.p90DispatchMinutes,
      withinFiveMinutesPercent: dispatchSummary.withinFiveMinutesPercent,
      deliveredOrders: selectedDispatchedOrders.filter(
        (order) => order.orderStatus === OrderStatus.DELIVERED
      ).length,
      averageTotalDeliveryMinutes: average(totalDeliveryMinutes),
      averagePostDispatchDeliveryMinutes: average(postDispatchDeliveryMinutes),
      cancelledOrders: selectedDispatchedOrders.filter(
        (order) => order.orderStatus === OrderStatus.CANCELLED
      ).length,
      assignmentActions: selectedEvents.filter(
        (event) =>
          event.eventType === DispatchEventType.ASSIGNED ||
          event.eventType === DispatchEventType.REASSIGNED
      ).length,
      reassignments: selectedEvents.filter(
        (event) => event.eventType === DispatchEventType.REASSIGNED
      ).length,
      unassignments: selectedEvents.filter(
        (event) => event.eventType === DispatchEventType.UNASSIGNED
      ).length
    },
    coverage: {
      totalOrders: input.orders.length,
      automaticDispatches: input.orders.filter(
        (order) => order.dispatchSource === DispatchSource.AUTO
      ).length,
      driverDispatches: input.orders.filter(
        (order) => order.dispatchSource === DispatchSource.DRIVER
      ).length,
      unattributedManualDispatches: input.orders.filter(
        (order) =>
          order.dispatchSource === DispatchSource.MANUAL &&
          !order.dispatchedByUserId
      ).length,
      unattributedDispatches: input.orders.filter(
        (order) => order.dispatchedAt && !order.dispatchSource
      ).length,
      undispatchedOrders: input.orders.filter((order) => !order.dispatchedAt).length,
      unknownSourceOrders: input.orders.filter(
        (order) => order.orderSource === OrderSource.UNKNOWN
      ).length
    },
    sourceBreakdown: buildSourceBreakdown(selectedDispatchedOrders),
    dailyTrend,
    stats,
    orders: orderDetails
  };
};
