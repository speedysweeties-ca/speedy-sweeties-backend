import type { Prisma } from "@prisma/client";
import type { MultiDestinationRouteMatrixResult } from "./multiDestinationRouteMatrix.service";

export const PICKUP_STORE_CLOSING_BUFFER_MINUTES = 3;
export const MAX_PICKUP_ROUTE_STOPS = 4;
export const MAX_PICKUP_STORE_CANDIDATES_PER_TYPE = 4;
const PICKUP_STORE_CLOSING_BUFFER_MS =
  PICKUP_STORE_CLOSING_BUFFER_MINUTES * 60 * 1000;
const ROUTING_TIME_ZONE = "America/Toronto";
const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

export type PickupStoreHoursSource = "MANUAL" | "CURRENT" | "REGULAR" | "NONE";

export type PickupStoreEligibilityReason =
  | "ELIGIBLE"
  | "BUSINESS_NOT_OPERATIONAL"
  | "MANUAL_CLOSED"
  | "NOT_OPEN_AT_ARRIVAL"
  | "CLOSES_WITHIN_BUFFER"
  | "HOURS_UNAVAILABLE";

export type PickupStoreEligibility = {
  eligible: boolean;
  reason: PickupStoreEligibilityReason;
  hoursSource: PickupStoreHoursSource;
  closingBufferMinutes: number;
  closingDate: string | null;
  closingTime: string | null;
};

type GoogleOpeningTime = {
  day?: number;
  hour?: number;
  minute?: number;
  date?: {
    year?: number;
    month?: number;
    day?: number;
  };
};

type GoogleOpeningPeriod = {
  open?: GoogleOpeningTime;
  close?: GoogleOpeningTime;
};

type GoogleOpeningHours = {
  periods?: GoogleOpeningPeriod[];
};

type ManualHoursOverrideEntry = {
  date?: string;
  isClosed?: boolean;
  openTime?: string;
  closeTime?: string;
};

export type PickupStoreCandidate = {
  id: string;
  name: string;
  pickupType: string;
  addressLine1: string;
  city: string;
  province: string;
  latitude: number;
  longitude: number;
  googleBusinessStatus: string | null;
  regularOpeningHours: Prisma.JsonValue | null;
  currentOpeningHours: Prisma.JsonValue | null;
  manualHoursOverride: Prisma.JsonValue | null;
};

export type PickupStoreRecommendation = {
  pickupType: string;
  storeId: string;
  storeName: string;
  addressLine1: string;
  city: string;
  province: string;
  etaMinutes: number;
  durationSeconds: number;
  distanceMeters: number | null;
  projectedArrivalAt: string;
  hoursSource: PickupStoreHoursSource;
  closingDate: string | null;
  closingTime: string | null;
  closingBufferMinutes: number;
};

export type SequentialPickupRoutePlan = {
  pickupStops: PickupStoreRecommendation[];
  totalDurationSeconds: number;
  totalDistanceMeters: number | null;
  customerLegDurationSeconds: number;
  customerLegDistanceMeters: number | null;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
};

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

const localFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ROUTING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

const getLocalDateParts = (date: Date): LocalDateParts => {
  const parts = localFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdayText = get("weekday");

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayMap[weekdayText] ?? 0,
    hour: Number(get("hour")),
    minute: Number(get("minute"))
  };
};

const dateKey = (parts: LocalDateParts): string =>
  `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;

const localPseudoMs = (parts: LocalDateParts): number =>
  Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);

const parseClock = (value: string | undefined): { hour: number; minute: number } | null => {
  if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
};

const formatClock = (hour: number, minute: number): string =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

const parseGoogleOpeningHours = (
  value: Prisma.JsonValue | null
): GoogleOpeningHours | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const periods = (value as Record<string, unknown>).periods;
  if (!Array.isArray(periods)) return { periods: undefined };
  return { periods: periods as GoogleOpeningPeriod[] };
};

const parseManualOverrides = (
  value: Prisma.JsonValue | null
): ManualHoursOverrideEntry[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ManualHoursOverrideEntry =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  );
};

const inManualOverride = (
  arrivalAt: Date,
  bufferedArrivalAt: Date,
  overrides: ManualHoursOverrideEntry[]
): PickupStoreEligibility | null => {
  const arrivalParts = getLocalDateParts(arrivalAt);
  const arrivalDate = dateKey(arrivalParts);
  const override = overrides.find((entry) => entry.date === arrivalDate);
  if (!override) return null;

  if (override.isClosed === true) {
    return {
      eligible: false,
      reason: "MANUAL_CLOSED",
      hoursSource: "MANUAL",
      closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
      closingDate: arrivalDate,
      closingTime: null
    };
  }

  const openClock = parseClock(override.openTime);
  const closeClock = parseClock(override.closeTime);
  if (!openClock || !closeClock) {
    return {
      eligible: false,
      reason: "HOURS_UNAVAILABLE",
      hoursSource: "MANUAL",
      closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
      closingDate: arrivalDate,
      closingTime: null
    };
  }

  const openPseudo = Date.UTC(
    arrivalParts.year,
    arrivalParts.month - 1,
    arrivalParts.day,
    openClock.hour,
    openClock.minute
  );
  let closePseudo = Date.UTC(
    arrivalParts.year,
    arrivalParts.month - 1,
    arrivalParts.day,
    closeClock.hour,
    closeClock.minute
  );
  if (closePseudo <= openPseudo) closePseudo += 24 * 60 * 60 * 1000;

  const arrivalPseudo = localPseudoMs(arrivalParts);
  let bufferedPseudo = localPseudoMs(getLocalDateParts(bufferedArrivalAt));
  if (bufferedPseudo < arrivalPseudo) bufferedPseudo += 24 * 60 * 60 * 1000;

  if (arrivalPseudo < openPseudo || arrivalPseudo >= closePseudo) {
    return {
      eligible: false,
      reason: "NOT_OPEN_AT_ARRIVAL",
      hoursSource: "MANUAL",
      closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
      closingDate: arrivalDate,
      closingTime: formatClock(closeClock.hour, closeClock.minute)
    };
  }

  if (bufferedPseudo > closePseudo) {
    return {
      eligible: false,
      reason: "CLOSES_WITHIN_BUFFER",
      hoursSource: "MANUAL",
      closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
      closingDate: arrivalDate,
      closingTime: formatClock(closeClock.hour, closeClock.minute)
    };
  }

  return {
    eligible: true,
    reason: "ELIGIBLE",
    hoursSource: "MANUAL",
    closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
    closingDate: arrivalDate,
    closingTime: formatClock(closeClock.hour, closeClock.minute)
  };
};

const evaluateExplicitDatePeriods = (
  arrivalAt: Date,
  bufferedArrivalAt: Date,
  periods: GoogleOpeningPeriod[],
  hoursSource: Exclude<PickupStoreHoursSource, "MANUAL" | "NONE">
): PickupStoreEligibility | null => {
  const explicitPeriods = periods.filter(
    (period) => period.open?.date?.year && period.open?.date?.month && period.open?.date?.day
  );
  if (explicitPeriods.length === 0) return null;

  const arrivalPseudo = localPseudoMs(getLocalDateParts(arrivalAt));
  const bufferedPseudo = localPseudoMs(getLocalDateParts(bufferedArrivalAt));

  for (const period of explicitPeriods) {
    const open = period.open!;
    const openDate = open.date!;
    const openPseudo = Date.UTC(
      Number(openDate.year),
      Number(openDate.month) - 1,
      Number(openDate.day),
      Number(open.hour ?? 0),
      Number(open.minute ?? 0)
    );

    if (!period.close) {
      if (arrivalPseudo >= openPseudo) {
        return {
          eligible: true,
          reason: "ELIGIBLE",
          hoursSource,
          closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
          closingDate: null,
          closingTime: null
        };
      }
      continue;
    }

    const close = period.close;
    const closeDate = close.date ?? openDate;
    let closePseudo = Date.UTC(
      Number(closeDate.year),
      Number(closeDate.month) - 1,
      Number(closeDate.day),
      Number(close.hour ?? 0),
      Number(close.minute ?? 0)
    );
    if (closePseudo <= openPseudo) closePseudo += 24 * 60 * 60 * 1000;

    if (arrivalPseudo >= openPseudo && arrivalPseudo < closePseudo) {
      const closeDateKey = `${String(closeDate.year).padStart(4, "0")}-${String(closeDate.month).padStart(2, "0")}-${String(closeDate.day).padStart(2, "0")}`;
      const closingTime = formatClock(Number(close.hour ?? 0), Number(close.minute ?? 0));

      return bufferedPseudo <= closePseudo
        ? {
            eligible: true,
            reason: "ELIGIBLE",
            hoursSource,
            closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
            closingDate: closeDateKey,
            closingTime
          }
        : {
            eligible: false,
            reason: "CLOSES_WITHIN_BUFFER",
            hoursSource,
            closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
            closingDate: closeDateKey,
            closingTime
          };
    }
  }

  return {
    eligible: false,
    reason: "NOT_OPEN_AT_ARRIVAL",
    hoursSource,
    closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
    closingDate: null,
    closingTime: null
  };
};

const evaluateWeeklyPeriods = (
  arrivalAt: Date,
  bufferedArrivalAt: Date,
  periods: GoogleOpeningPeriod[],
  hoursSource: Exclude<PickupStoreHoursSource, "MANUAL" | "NONE">
): PickupStoreEligibility => {
  const arrival = getLocalDateParts(arrivalAt);
  const buffered = getLocalDateParts(bufferedArrivalAt);
  const arrivalWeekMinute = arrival.weekday * MINUTES_PER_DAY + arrival.hour * 60 + arrival.minute;
  let bufferedWeekMinute = buffered.weekday * MINUTES_PER_DAY + buffered.hour * 60 + buffered.minute;
  if (bufferedWeekMinute < arrivalWeekMinute) bufferedWeekMinute += MINUTES_PER_WEEK;

  for (const period of periods) {
    const open = period.open;
    if (!open || typeof open.day !== "number") continue;

    const openWeekMinute =
      open.day * MINUTES_PER_DAY + Number(open.hour ?? 0) * 60 + Number(open.minute ?? 0);

    if (!period.close) {
      const adjustedArrival =
        arrivalWeekMinute < openWeekMinute
          ? arrivalWeekMinute + MINUTES_PER_WEEK
          : arrivalWeekMinute;
      if (adjustedArrival >= openWeekMinute) {
        return {
          eligible: true,
          reason: "ELIGIBLE",
          hoursSource,
          closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
          closingDate: null,
          closingTime: null
        };
      }
      continue;
    }

    const close = period.close;
    if (typeof close.day !== "number") continue;
    let closeWeekMinute =
      close.day * MINUTES_PER_DAY + Number(close.hour ?? 0) * 60 + Number(close.minute ?? 0);
    if (closeWeekMinute <= openWeekMinute) closeWeekMinute += MINUTES_PER_WEEK;

    for (const weekOffset of [0, MINUTES_PER_WEEK]) {
      const adjustedArrival = arrivalWeekMinute + weekOffset;
      const adjustedBuffered = bufferedWeekMinute + weekOffset;
      if (
        adjustedArrival >= openWeekMinute &&
        adjustedArrival < closeWeekMinute
      ) {
        const closingTime = formatClock(
          Number(close.hour ?? 0),
          Number(close.minute ?? 0)
        );

        return adjustedBuffered <= closeWeekMinute
          ? {
              eligible: true,
              reason: "ELIGIBLE",
              hoursSource,
              closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
              closingDate: null,
              closingTime
            }
          : {
              eligible: false,
              reason: "CLOSES_WITHIN_BUFFER",
              hoursSource,
              closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
              closingDate: null,
              closingTime
            };
      }
    }
  }

  return {
    eligible: false,
    reason: "NOT_OPEN_AT_ARRIVAL",
    hoursSource,
    closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
    closingDate: null,
    closingTime: null
  };
};

const evaluateGoogleHours = (
  arrivalAt: Date,
  bufferedArrivalAt: Date,
  hoursValue: Prisma.JsonValue | null,
  hoursSource: Exclude<PickupStoreHoursSource, "MANUAL" | "NONE">
): PickupStoreEligibility | null => {
  const hours = parseGoogleOpeningHours(hoursValue);
  if (!hours) return null;

  if (!hours.periods || hours.periods.length === 0) {
    return {
      eligible: false,
      reason: "NOT_OPEN_AT_ARRIVAL",
      hoursSource,
      closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
      closingDate: null,
      closingTime: null
    };
  }

  return (
    evaluateExplicitDatePeriods(
      arrivalAt,
      bufferedArrivalAt,
      hours.periods,
      hoursSource
    ) ?? evaluateWeeklyPeriods(arrivalAt, bufferedArrivalAt, hours.periods, hoursSource)
  );
};

export const evaluatePickupStoreEligibility = (
  store: PickupStoreCandidate,
  projectedArrivalAt: Date
): PickupStoreEligibility => {
  if (
    store.googleBusinessStatus &&
    store.googleBusinessStatus !== "OPERATIONAL"
  ) {
    return {
      eligible: false,
      reason: "BUSINESS_NOT_OPERATIONAL",
      hoursSource: "NONE",
      closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
      closingDate: null,
      closingTime: null
    };
  }

  const bufferedArrivalAt = new Date(
    projectedArrivalAt.getTime() + PICKUP_STORE_CLOSING_BUFFER_MS
  );

  const manual = inManualOverride(
    projectedArrivalAt,
    bufferedArrivalAt,
    parseManualOverrides(store.manualHoursOverride)
  );
  if (manual) return manual;

  const current = evaluateGoogleHours(
    projectedArrivalAt,
    bufferedArrivalAt,
    store.currentOpeningHours,
    "CURRENT"
  );
  if (current) return current;

  const regular = evaluateGoogleHours(
    projectedArrivalAt,
    bufferedArrivalAt,
    store.regularOpeningHours,
    "REGULAR"
  );
  if (regular) return regular;

  return {
    eligible: false,
    reason: "HOURS_UNAVAILABLE",
    hoursSource: "NONE",
    closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES,
    closingDate: null,
    closingTime: null
  };
};

export const pickupStoreRouteNodeId = (storeId: string): string =>
  `pickup-store:${storeId}`;

type RouteSearchStop = {
  pickupType: string;
  store: PickupStoreCandidate;
  elapsedDurationSeconds: number;
  elapsedDistanceMeters: number | null;
  projectedArrivalAt: Date;
  eligibility: PickupStoreEligibility;
};

const routeKey = (originId: string, destinationId: string): string =>
  `${originId}\u0000${destinationId}`;

const compareStoreCandidates = (
  a: { store: PickupStoreCandidate; route: MultiDestinationRouteMatrixResult },
  b: { store: PickupStoreCandidate; route: MultiDestinationRouteMatrixResult }
): number => {
  const durationDifference =
    (a.route.durationSeconds ?? Number.POSITIVE_INFINITY) -
    (b.route.durationSeconds ?? Number.POSITIVE_INFINITY);
  if (durationDifference !== 0) return durationDifference;

  const nameComparison = a.store.name.localeCompare(b.store.name);
  if (nameComparison !== 0) return nameComparison;
  return a.store.id.localeCompare(b.store.id);
};

const addRouteDistance = (
  elapsedDistanceMeters: number | null,
  routeDistanceMeters: number | null
): number | null =>
  elapsedDistanceMeters === null || routeDistanceMeters === null
    ? null
    : elapsedDistanceMeters + routeDistanceMeters;

export const selectSequentialPickupRoutePlan = (input: {
  driverRouteNodeId: string;
  customerRouteNodeId: string;
  requiredPickupTypes: string[];
  stores: PickupStoreCandidate[];
  matrix: MultiDestinationRouteMatrixResult[];
  generatedAt: Date;
}): SequentialPickupRoutePlan | null => {
  const routesByEndpoints = new Map(
    input.matrix.map((route) => [
      routeKey(route.originId, route.destinationId),
      route
    ])
  );
  const routeFor = (
    originId: string,
    destinationId: string
  ): MultiDestinationRouteMatrixResult | null => {
    const route = routesByEndpoints.get(routeKey(originId, destinationId));
    return route?.routeAvailable && route.durationSeconds !== null ? route : null;
  };
  const requiredPickupTypes = Array.from(new Set(input.requiredPickupTypes)).sort(
    (a, b) => a.localeCompare(b)
  );

  if (requiredPickupTypes.length === 0) {
    const directRoute = routeFor(
      input.driverRouteNodeId,
      input.customerRouteNodeId
    );
    if (!directRoute || directRoute.durationSeconds === null) return null;

    return {
      pickupStops: [],
      totalDurationSeconds: directRoute.durationSeconds,
      totalDistanceMeters: directRoute.distanceMeters,
      customerLegDurationSeconds: directRoute.durationSeconds,
      customerLegDistanceMeters: directRoute.distanceMeters
    };
  }

  if (requiredPickupTypes.length > MAX_PICKUP_ROUTE_STOPS) return null;

  const candidatesByPickupType = new Map<string, PickupStoreCandidate[]>();

  for (const pickupType of requiredPickupTypes) {
    const candidates = input.stores
      .filter((store) => store.pickupType === pickupType)
      .map((store) => {
        const route = routeFor(
          input.driverRouteNodeId,
          pickupStoreRouteNodeId(store.id)
        );
        return route ? { store, route } : null;
      })
      .filter(
        (
          candidate
        ): candidate is {
          store: PickupStoreCandidate;
          route: MultiDestinationRouteMatrixResult;
        } => candidate !== null
      )
      .sort(compareStoreCandidates)
      .slice(0, MAX_PICKUP_STORE_CANDIDATES_PER_TYPE)
      .map((candidate) => candidate.store);

    if (candidates.length === 0) return null;
    candidatesByPickupType.set(pickupType, candidates);
  }

  let selectedPlan:
    | (SequentialPickupRoutePlan & { routeSignature: string })
    | null = null;

  const considerPlan = (
    stops: RouteSearchStop[],
    totalDurationSeconds: number,
    totalDistanceMeters: number | null,
    customerLegDurationSeconds: number,
    customerLegDistanceMeters: number | null
  ): void => {
    const routeSignature = stops
      .map((stop) => `${stop.pickupType}:${stop.store.id}`)
      .join("|");
    const pickupStops = stops.map((stop) => ({
      pickupType: stop.pickupType,
      storeId: stop.store.id,
      storeName: stop.store.name,
      addressLine1: stop.store.addressLine1,
      city: stop.store.city,
      province: stop.store.province,
      etaMinutes: Math.max(1, Math.round(stop.elapsedDurationSeconds / 60)),
      durationSeconds: stop.elapsedDurationSeconds,
      distanceMeters: stop.elapsedDistanceMeters,
      projectedArrivalAt: stop.projectedArrivalAt.toISOString(),
      hoursSource: stop.eligibility.hoursSource,
      closingDate: stop.eligibility.closingDate,
      closingTime: stop.eligibility.closingTime,
      closingBufferMinutes: stop.eligibility.closingBufferMinutes
    }));
    const isFaster =
      !selectedPlan || totalDurationSeconds < selectedPlan.totalDurationSeconds;
    const isDeterministicallyFirst =
      selectedPlan !== null &&
      totalDurationSeconds === selectedPlan.totalDurationSeconds &&
      routeSignature.localeCompare(selectedPlan.routeSignature) < 0;

    if (!isFaster && !isDeterministicallyFirst) return;

    selectedPlan = {
      pickupStops,
      totalDurationSeconds,
      totalDistanceMeters,
      customerLegDurationSeconds,
      customerLegDistanceMeters,
      routeSignature
    };
  };

  const visitStops = (
    currentRouteNodeId: string,
    elapsedDurationSeconds: number,
    elapsedDistanceMeters: number | null,
    remainingPickupTypes: string[],
    stops: RouteSearchStop[]
  ): void => {
    if (remainingPickupTypes.length === 0) {
      const customerRoute = routeFor(
        currentRouteNodeId,
        input.customerRouteNodeId
      );
      if (!customerRoute || customerRoute.durationSeconds === null) return;

      considerPlan(
        stops,
        elapsedDurationSeconds + customerRoute.durationSeconds,
        addRouteDistance(elapsedDistanceMeters, customerRoute.distanceMeters),
        customerRoute.durationSeconds,
        customerRoute.distanceMeters
      );
      return;
    }

    for (const pickupType of remainingPickupTypes) {
      const candidates = candidatesByPickupType.get(pickupType) ?? [];

      for (const store of candidates) {
        const route = routeFor(
          currentRouteNodeId,
          pickupStoreRouteNodeId(store.id)
        );
        if (!route || route.durationSeconds === null) continue;

        const nextElapsedDurationSeconds =
          elapsedDurationSeconds + route.durationSeconds;
        const projectedArrivalAt = new Date(
          input.generatedAt.getTime() + nextElapsedDurationSeconds * 1000
        );
        const eligibility = evaluatePickupStoreEligibility(
          store,
          projectedArrivalAt
        );
        if (!eligibility.eligible) continue;

        visitStops(
          pickupStoreRouteNodeId(store.id),
          nextElapsedDurationSeconds,
          addRouteDistance(elapsedDistanceMeters, route.distanceMeters),
          remainingPickupTypes.filter((type) => type !== pickupType),
          [
            ...stops,
            {
              pickupType,
              store,
              elapsedDurationSeconds: nextElapsedDurationSeconds,
              elapsedDistanceMeters: addRouteDistance(
                elapsedDistanceMeters,
                route.distanceMeters
              ),
              projectedArrivalAt,
              eligibility
            }
          ]
        );
      }
    }
  };

  visitStops(
    input.driverRouteNodeId,
    0,
    0,
    requiredPickupTypes,
    []
  );

  if (!selectedPlan) return null;
  const { routeSignature: _routeSignature, ...plan } = selectedPlan;
  return plan;
};

export const selectPickupStoreRecommendations = (input: {
  driverId: string;
  requiredPickupTypes: string[];
  stores: PickupStoreCandidate[];
  matrix: MultiDestinationRouteMatrixResult[];
  generatedAt: Date;
}): Array<PickupStoreRecommendation | { pickupType: string; unavailable: true }> => {
  const matrixByStoreId = new Map(
    input.matrix
      .filter((result) => result.originId === input.driverId)
      .map((result) => [result.destinationId, result])
  );

  return input.requiredPickupTypes.map((pickupType) => {
    const eligible = input.stores
      .filter((store) => store.pickupType === pickupType)
      .map((store) => {
        const route = matrixByStoreId.get(store.id);
        if (
          !route?.routeAvailable ||
          route.durationSeconds === null
        ) {
          return null;
        }

        const projectedArrivalAt = new Date(
          input.generatedAt.getTime() + route.durationSeconds * 1000
        );
        const eligibility = evaluatePickupStoreEligibility(
          store,
          projectedArrivalAt
        );
        if (!eligibility.eligible) return null;

        return {
          store,
          route,
          projectedArrivalAt,
          eligibility
        };
      })
      .filter(
        (
          candidate
        ): candidate is {
          store: PickupStoreCandidate;
          route: MultiDestinationRouteMatrixResult & {
            durationSeconds: number;
          };
          projectedArrivalAt: Date;
          eligibility: PickupStoreEligibility;
        } => candidate !== null
      )
      .sort((a, b) => a.route.durationSeconds - b.route.durationSeconds);

    const selected = eligible[0];
    if (!selected) {
      return { pickupType, unavailable: true as const };
    }

    return {
      pickupType,
      storeId: selected.store.id,
      storeName: selected.store.name,
      addressLine1: selected.store.addressLine1,
      city: selected.store.city,
      province: selected.store.province,
      etaMinutes: Math.max(1, Math.round(selected.route.durationSeconds / 60)),
      durationSeconds: selected.route.durationSeconds,
      distanceMeters: selected.route.distanceMeters,
      projectedArrivalAt: selected.projectedArrivalAt.toISOString(),
      hoursSource: selected.eligibility.hoursSource,
      closingDate: selected.eligibility.closingDate,
      closingTime: selected.eligibility.closingTime,
      closingBufferMinutes: PICKUP_STORE_CLOSING_BUFFER_MINUTES
    };
  });
};
