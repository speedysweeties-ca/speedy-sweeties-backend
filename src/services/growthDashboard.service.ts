import { OrderSource, OrderStatus, PaymentMethod } from "@prisma/client";

const TORONTO_TIME_ZONE = "America/Toronto";
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;
const ACTIVE_ORDER_STATUSES = new Set<OrderStatus>([
  OrderStatus.PLACED,
  OrderStatus.DISPATCHED,
  OrderStatus.ACCEPTED,
  OrderStatus.OUT_FOR_DELIVERY
]);
const ORDER_SOURCES: OrderSource[] = [
  OrderSource.UNKNOWN,
  OrderSource.ANDROID_APP,
  OrderSource.IOS_APP,
  OrderSource.WEBFLOW,
  OrderSource.DISPATCHER_MANUAL
];

type DecimalLike =
  | number
  | string
  | { toNumber?: () => number; toString?: () => string }
  | null
  | undefined;

export type GrowthDashboardOrder = {
  id: string;
  customerId: string | null;
  paymentMethod: PaymentMethod;
  orderStatus: OrderStatus;
  createdAt: Date;
  dispatchedAt: Date | null;
  deliveredAt: Date | null;
  orderSource: OrderSource;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referralCode: string | null;
  digitalReceipt: {
    deliveryCharge: DecimalLike;
    grandTotal: DecimalLike;
  } | null;
};

export type GrowthDashboardDateRange = {
  startDate: string;
  endDate: string;
  startUtc: Date;
  endExclusiveUtc: Date;
  days: number;
};

export type FirstDeliveredOrderAttribution = Pick<
  GrowthDashboardOrder,
  | "createdAt"
  | "orderSource"
  | "utmSource"
  | "utmMedium"
  | "utmCampaign"
  | "utmContent"
  | "utmTerm"
  | "referralCode"
>;

export type FirstDeliveredOrderByCustomer = Map<
  string,
  FirstDeliveredOrderAttribution
>;

export type DeliveredOrderCountByCustomer = Map<string, number>;

const round = (value: number, digits = 1): number => {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
};

const average = (values: number[]): number | null => {
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const percentage = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return round((numerator / denominator) * 100);
};

const minutesBetween = (start: Date, end: Date | null): number | null => {
  if (!end) return null;
  const difference = (end.getTime() - start.getTime()) / 60_000;
  return difference >= 0 ? difference : null;
};

const decimalToNumber = (value: DecimalLike): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value.toNumber === "function") {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value.toString === "function") {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const datePartsFromKey = (dateKey: string) => {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    throw new Error("Dates must use YYYY-MM-DD format.");
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("The selected date is invalid.");
  }

  return { year, month, day };
};

const formatDateParts = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const addCalendarDays = (dateKey: string, days: number): string => {
  const { year, month, day } = datePartsFromKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateParts(date);
};

export const formatTorontoDateKey = (date: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value;

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");

  if (!year || !month || !day) {
    throw new Error("Unable to determine the Toronto calendar date.");
  }

  return `${year}-${month}-${day}`;
};

const getTorontoUtcOffsetMilliseconds = (instant: Date): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TORONTO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant);

  const numberPart = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  const asUtc = Date.UTC(
    numberPart("year"),
    numberPart("month") - 1,
    numberPart("day"),
    numberPart("hour"),
    numberPart("minute"),
    numberPart("second")
  );

  return asUtc - instant.getTime();
};

export const torontoDateStartUtc = (dateKey: string): Date => {
  const { year, month, day } = datePartsFromKey(dateKey);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let utcMilliseconds = localMidnightAsUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = getTorontoUtcOffsetMilliseconds(new Date(utcMilliseconds));
    utcMilliseconds = localMidnightAsUtc - offset;
  }

  return new Date(utcMilliseconds);
};

export const buildGrowthDashboardDateRange = (
  requestedStartDate?: string,
  requestedEndDate?: string,
  now = new Date()
): GrowthDashboardDateRange => {
  const today = formatTorontoDateKey(now);
  const endDate = requestedEndDate || today;
  const startDate = requestedStartDate || addCalendarDays(endDate, -29);

  const startParts = datePartsFromKey(startDate);
  const endParts = datePartsFromKey(endDate);
  const startOrdinal = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const endOrdinal = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
  const days = Math.floor((endOrdinal - startOrdinal) / 86_400_000) + 1;

  if (days <= 0) {
    throw new Error("Start date must be on or before end date.");
  }

  if (days > MAX_RANGE_DAYS) {
    throw new Error(`Date range cannot exceed ${MAX_RANGE_DAYS} days.`);
  }

  return {
    startDate,
    endDate,
    startUtc: torontoDateStartUtc(startDate),
    endExclusiveUtc: torontoDateStartUtc(addCalendarDays(endDate, 1)),
    days
  };
};

const getTorontoHour = (date: Date): number => {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: TORONTO_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23"
  })
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value;

  return Number(hour ?? 0);
};

const getTorontoWeekday = (date: Date): string => {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TORONTO_TIME_ZONE,
    weekday: "short"
  }).format(date);
};

const createDateKeys = (range: GrowthDashboardDateRange): string[] => {
  return Array.from({ length: range.days }, (_, index) =>
    addCalendarDays(range.startDate, index)
  );
};

export const buildGrowthPeriodMetrics = (
  orders: GrowthDashboardOrder[],
  range: GrowthDashboardDateRange,
  firstDeliveredOrderByCustomer: FirstDeliveredOrderByCustomer,
  deliveredOrderCountByCustomer: DeliveredOrderCountByCustomer = new Map()
) => {
  const statusCounts: Record<OrderStatus, number> = {
    PLACED: 0,
    DISPATCHED: 0,
    ACCEPTED: 0,
    OUT_FOR_DELIVERY: 0,
    DELIVERED: 0,
    CANCELLED: 0
  };
  const paymentCounts: Record<PaymentMethod, number> = {
    CASH: 0,
    DEBIT: 0,
    VISA: 0,
    MASTERCARD: 0,
    ETRANSFER: 0
  };
  const dailyByDate = new Map(
    createDateKeys(range).map((date) => [
      date,
      { date, totalOrders: 0, deliveredOrders: 0, cancelledOrders: 0 }
    ])
  );
  const weekdayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdayByName = new Map(
    weekdayOrder.map((weekday) => [weekday, { weekday, totalOrders: 0 }])
  );
  const hourlyByHour = new Map(
    Array.from({ length: 24 }, (_, hour) => [hour, { hour, totalOrders: 0 }])
  );
  const dispatchMinutes: number[] = [];
  const totalOrderMinutes: number[] = [];
  const deliveredCustomerIds = new Set<string>();
  const sourceRows = new Map(
    ORDER_SOURCES.map((source) => [
      source,
      {
        source,
        totalOrders: 0,
        deliveredOrders: 0,
        cancelledOrders: 0,
        deliveredCustomerIds: new Set<string>(),
        returningCustomerIds: new Set<string>(),
        newCustomerIds: new Set<string>(),
        repeatedNewCustomerIds: new Set<string>(),
        deliveryFeesRecorded: 0
      }
    ])
  );
  const campaignRows = new Map<
    string,
    {
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      referralCode: string | null;
      orderSources: Set<OrderSource>;
      totalOrders: number;
      deliveredOrders: number;
      cancelledOrders: number;
      newCustomerIds: Set<string>;
      repeatedNewCustomerIds: Set<string>;
      deliveryFeesRecorded: number;
    }
  >();
  let deliveredOrdersWithCustomer = 0;
  let deliveredOrdersWithReceipt = 0;
  let deliveredOrdersWithDispatchTimestamp = 0;
  let deliveredOrdersWithDuration = 0;
  let deliveriesUnderFortyMinutes = 0;
  let dispatchesOverFiveMinutes = 0;
  let deliveryFeesRecorded = 0;
  let receiptSalesTotal = 0;
  let ordersWithKnownSource = 0;
  let ordersWithCampaignTag = 0;

  const campaignKeyFor = (
    attribution: Pick<
      GrowthDashboardOrder,
      "utmSource" | "utmMedium" | "utmCampaign" | "referralCode"
    >
  ): string | null => {
    const values = [
      attribution.utmSource,
      attribution.utmMedium,
      attribution.utmCampaign,
      attribution.referralCode
    ].map((value) => value?.trim() || null);

    return values.some(Boolean)
      ? JSON.stringify(values.map((value) => value?.toLocaleLowerCase() || null))
      : null;
  };

  const getCampaignRow = (
    attribution: Pick<
      GrowthDashboardOrder,
      | "orderSource"
      | "utmSource"
      | "utmMedium"
      | "utmCampaign"
      | "referralCode"
    >
  ) => {
    const key = campaignKeyFor(attribution);
    if (!key) return null;

    let row = campaignRows.get(key);
    if (!row) {
      row = {
        utmSource: attribution.utmSource,
        utmMedium: attribution.utmMedium,
        utmCampaign: attribution.utmCampaign,
        referralCode: attribution.referralCode,
        orderSources: new Set<OrderSource>(),
        totalOrders: 0,
        deliveredOrders: 0,
        cancelledOrders: 0,
        newCustomerIds: new Set<string>(),
        repeatedNewCustomerIds: new Set<string>(),
        deliveryFeesRecorded: 0
      };
      campaignRows.set(key, row);
    }

    row.orderSources.add(attribution.orderSource);
    return row;
  };

  for (const order of orders) {
    statusCounts[order.orderStatus] += 1;
    paymentCounts[order.paymentMethod] += 1;
    if (order.orderSource !== OrderSource.UNKNOWN) ordersWithKnownSource += 1;

    const sourceRow = sourceRows.get(order.orderSource)!;
    sourceRow.totalOrders += 1;
    const campaignRow = getCampaignRow(order);
    if (campaignRow) {
      ordersWithCampaignTag += 1;
      campaignRow.totalOrders += 1;
    }

    if (order.orderStatus === OrderStatus.CANCELLED) {
      sourceRow.cancelledOrders += 1;
      if (campaignRow) campaignRow.cancelledOrders += 1;
    }

    const dateKey = formatTorontoDateKey(order.createdAt);
    const daily = dailyByDate.get(dateKey);
    if (daily) {
      daily.totalOrders += 1;
      if (order.orderStatus === OrderStatus.DELIVERED) daily.deliveredOrders += 1;
      if (order.orderStatus === OrderStatus.CANCELLED) daily.cancelledOrders += 1;
    }

    const weekday = getTorontoWeekday(order.createdAt);
    const weekdayRow = weekdayByName.get(weekday);
    if (weekdayRow) weekdayRow.totalOrders += 1;

    const hourRow = hourlyByHour.get(getTorontoHour(order.createdAt));
    if (hourRow) hourRow.totalOrders += 1;

    const minutesToDispatch = minutesBetween(order.createdAt, order.dispatchedAt);
    if (minutesToDispatch !== null) {
      dispatchMinutes.push(minutesToDispatch);
      if (minutesToDispatch > 5) dispatchesOverFiveMinutes += 1;
    }

    if (order.orderStatus !== OrderStatus.DELIVERED) continue;

    sourceRow.deliveredOrders += 1;
    if (campaignRow) campaignRow.deliveredOrders += 1;

    if (order.customerId) {
      deliveredOrdersWithCustomer += 1;
      deliveredCustomerIds.add(order.customerId);
      sourceRow.deliveredCustomerIds.add(order.customerId);
    }

    if (minutesToDispatch !== null) deliveredOrdersWithDispatchTimestamp += 1;

    const totalMinutes = minutesBetween(order.createdAt, order.deliveredAt);
    if (totalMinutes !== null) {
      deliveredOrdersWithDuration += 1;
      totalOrderMinutes.push(totalMinutes);
      if (totalMinutes <= 40) deliveriesUnderFortyMinutes += 1;
    }

    if (order.digitalReceipt) {
      deliveredOrdersWithReceipt += 1;
      const orderDeliveryFee = decimalToNumber(
        order.digitalReceipt.deliveryCharge
      );
      deliveryFeesRecorded += orderDeliveryFee;
      receiptSalesTotal += decimalToNumber(order.digitalReceipt.grandTotal);
      sourceRow.deliveryFeesRecorded += orderDeliveryFee;
      if (campaignRow) campaignRow.deliveryFeesRecorded += orderDeliveryFee;
    }
  }

  let newCustomers = 0;
  let returningCustomers = 0;
  let newCustomersWithRepeatOrder = 0;

  for (const customerId of deliveredCustomerIds) {
    const firstDeliveredOrder = firstDeliveredOrderByCustomer.get(customerId);
    if (firstDeliveredOrder && firstDeliveredOrder.createdAt < range.startUtc) {
      returningCustomers += 1;

      for (const sourceRow of sourceRows.values()) {
        if (sourceRow.deliveredCustomerIds.has(customerId)) {
          sourceRow.returningCustomerIds.add(customerId);
        }
      }
    } else {
      newCustomers += 1;

      const acquisitionSource =
        firstDeliveredOrder?.orderSource ?? OrderSource.UNKNOWN;
      const acquisitionSourceRow = sourceRows.get(acquisitionSource)!;
      acquisitionSourceRow.newCustomerIds.add(customerId);

      const repeated = (deliveredOrderCountByCustomer.get(customerId) ?? 0) >= 2;
      if (repeated) {
        newCustomersWithRepeatOrder += 1;
        acquisitionSourceRow.repeatedNewCustomerIds.add(customerId);
      }

      if (firstDeliveredOrder) {
        const acquisitionCampaignRow = getCampaignRow(firstDeliveredOrder);
        acquisitionCampaignRow?.newCustomerIds.add(customerId);
        if (repeated) {
          acquisitionCampaignRow?.repeatedNewCustomerIds.add(customerId);
        }
      }
    }
  }

  const deliveredOrders = statusCounts.DELIVERED;
  const cancelledOrders = statusCounts.CANCELLED;
  const resolvedOrders = deliveredOrders + cancelledOrders;

  return {
    totalOrders: orders.length,
    deliveredOrders,
    cancelledOrders,
    activeOrders:
      statusCounts.PLACED +
      statusCounts.DISPATCHED +
      statusCounts.ACCEPTED +
      statusCounts.OUT_FOR_DELIVERY,
    uniqueDeliveredCustomers: deliveredCustomerIds.size,
    newCustomers,
    newCustomersWithRepeatOrder,
    secondOrderConversionRate: percentage(
      newCustomersWithRepeatOrder,
      newCustomers
    ),
    returningCustomers,
    returningCustomerRate: percentage(
      returningCustomers,
      deliveredCustomerIds.size
    ),
    completionRate: percentage(deliveredOrders, resolvedOrders),
    cancellationRate: percentage(cancelledOrders, resolvedOrders),
    averageMinutesToDispatch: average(dispatchMinutes),
    dispatchesOverFiveMinutesRate: percentage(
      dispatchesOverFiveMinutes,
      dispatchMinutes.length
    ),
    averageMinutesCreatedToDelivered: average(totalOrderMinutes),
    deliveriesUnderFortyMinutesRate: percentage(
      deliveriesUnderFortyMinutes,
      deliveredOrdersWithDuration
    ),
    deliveryFeesRecorded: round(deliveryFeesRecorded, 2),
    receiptSalesTotal: round(receiptSalesTotal, 2),
    statusCounts,
    paymentCounts,
    dataCoverage: {
      customerLinkRate: percentage(deliveredOrdersWithCustomer, deliveredOrders),
      receiptRate: percentage(deliveredOrdersWithReceipt, deliveredOrders),
      dispatchTimestampRate: percentage(
        deliveredOrdersWithDispatchTimestamp,
        deliveredOrders
      ),
      deliveryTimeRate: percentage(deliveredOrdersWithDuration, deliveredOrders),
      orderSourceRate: percentage(ordersWithKnownSource, orders.length),
      campaignTagRate: percentage(ordersWithCampaignTag, orders.length)
    },
    sources: Array.from(sourceRows.values())
      .map((row) => ({
        source: row.source,
        totalOrders: row.totalOrders,
        deliveredOrders: row.deliveredOrders,
        cancelledOrders: row.cancelledOrders,
        uniqueDeliveredCustomers: row.deliveredCustomerIds.size,
        newCustomers: row.newCustomerIds.size,
        returningCustomers: row.returningCustomerIds.size,
        newCustomersWithRepeatOrder: row.repeatedNewCustomerIds.size,
        secondOrderConversionRate: percentage(
          row.repeatedNewCustomerIds.size,
          row.newCustomerIds.size
        ),
        completionRate: percentage(
          row.deliveredOrders,
          row.deliveredOrders + row.cancelledOrders
        ),
        deliveryFeesRecorded: round(row.deliveryFeesRecorded, 2)
      }))
      .sort((left, right) => right.totalOrders - left.totalOrders),
    campaigns: Array.from(campaignRows.values())
      .map((row) => ({
        utmSource: row.utmSource,
        utmMedium: row.utmMedium,
        utmCampaign: row.utmCampaign,
        referralCode: row.referralCode,
        orderSources: Array.from(row.orderSources),
        totalOrders: row.totalOrders,
        deliveredOrders: row.deliveredOrders,
        cancelledOrders: row.cancelledOrders,
        newCustomers: row.newCustomerIds.size,
        newCustomersWithRepeatOrder: row.repeatedNewCustomerIds.size,
        secondOrderConversionRate: percentage(
          row.repeatedNewCustomerIds.size,
          row.newCustomerIds.size
        ),
        completionRate: percentage(
          row.deliveredOrders,
          row.deliveredOrders + row.cancelledOrders
        ),
        deliveryFeesRecorded: round(row.deliveryFeesRecorded, 2)
      }))
      .sort((left, right) => right.totalOrders - left.totalOrders),
    daily: Array.from(dailyByDate.values()),
    weekdays: weekdayOrder.map((weekday) => weekdayByName.get(weekday)!),
    hours: Array.from(hourlyByHour.values())
  };
};

export const buildLiveGrowthSnapshot = (
  orders: Pick<GrowthDashboardOrder, "orderStatus" | "createdAt" | "dispatchedAt">[],
  now = new Date()
) => {
  const activeOrders = orders.filter((order) =>
    ACTIVE_ORDER_STATUSES.has(order.orderStatus)
  );

  return {
    activeOrders: activeOrders.length,
    waitingOverFiveMinutes: activeOrders.filter(
      (order) =>
        order.orderStatus === OrderStatus.PLACED &&
        !order.dispatchedAt &&
        now.getTime() - order.createdAt.getTime() > 5 * 60_000
    ).length,
    runningOverFortyMinutes: activeOrders.filter(
      (order) => now.getTime() - order.createdAt.getTime() > 40 * 60_000
    ).length
  };
};
