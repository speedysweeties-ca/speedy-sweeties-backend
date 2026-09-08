import { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REGULAR_HOURS_REFRESH_MS = 30 * DAY_MS;
export const CURRENT_HOURS_REFRESH_MS = 7 * DAY_MS;
const FAILED_REFRESH_RETRY_MS = 20 * 60 * 60 * 1000;
const MONITOR_INTERVAL_MS = DAY_MS;
const INITIAL_MONITOR_DELAY_MS = 45_000;
const GOOGLE_PLACES_TIMEOUT_MS = 6_000;
const PLACE_MATCH_MAX_DISTANCE_METERS = 250;

export type GoogleOpeningTime = {
  day?: number;
  hour?: number;
  minute?: number;
  date?: {
    year?: number;
    month?: number;
    day?: number;
  };
};

export type GoogleOpeningPeriod = {
  open?: GoogleOpeningTime;
  close?: GoogleOpeningTime;
};

export type GoogleOpeningHours = {
  openNow?: boolean;
  periods?: GoogleOpeningPeriod[];
  weekdayDescriptions?: string[];
  specialDays?: Array<{
    date?: {
      year?: number;
      month?: number;
      day?: number;
    };
    exceptionalHours?: boolean;
  }>;
  nextOpenTime?: string;
  nextCloseTime?: string;
};

type GooglePlaceCandidate = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  businessStatus?: string;
};

type GoogleTextSearchResponse = {
  places?: GooglePlaceCandidate[];
};

type GooglePlaceDetailsResponse = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  businessStatus?: string;
  regularOpeningHours?: GoogleOpeningHours;
  currentOpeningHours?: GoogleOpeningHours;
};

type PickupLocationForHours = {
  id: string;
  name: string;
  pickupType: string;
  addressLine1: string;
  city: string;
  province: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  googlePlaceId: string | null;
  regularHoursUpdatedAt: Date | null;
  currentHoursUpdatedAt: Date | null;
  hoursLastCheckedAt: Date | null;
};

export type PickupLocationHoursRefreshSummary = {
  checked: number;
  refreshed: number;
  skipped: number;
  failed: number;
  placeIdsFound: number;
  regularHoursRefreshed: number;
  currentHoursRefreshed: number;
};

const normalizeText = (value: string | null | undefined): string =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const extractStreetNumber = (value: string): string | null => {
  const match = value.match(/\b\d+[a-z]?\b/i);
  return match?.[0]?.toLowerCase() ?? null;
};

const toRadians = (value: number): number => (value * Math.PI) / 180;

const distanceMeters = (
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
): number => {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const startLatitude = toRadians(latitudeA);
  const endLatitude = toRadians(latitudeB);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
};

const nameMatchScore = (expectedName: string, candidateName: string): number => {
  const expected = normalizeText(expectedName);
  const candidate = normalizeText(candidateName);

  if (!expected || !candidate) return 0;
  if (expected === candidate) return 1;
  if (expected.includes(candidate) || candidate.includes(expected)) return 0.9;

  const expectedTokens = new Set(expected.split(" ").filter((token) => token.length > 1));
  const candidateTokens = new Set(candidate.split(" ").filter((token) => token.length > 1));
  if (expectedTokens.size === 0 || candidateTokens.size === 0) return 0;

  let shared = 0;
  expectedTokens.forEach((token) => {
    if (candidateTokens.has(token)) shared += 1;
  });

  return shared / Math.max(expectedTokens.size, candidateTokens.size);
};

export const isHoursRefreshDue = (
  lastUpdatedAt: Date | null,
  refreshIntervalMs: number,
  now = new Date()
): boolean => {
  if (!lastUpdatedAt) return true;
  return now.getTime() - lastUpdatedAt.getTime() >= refreshIntervalMs;
};

export const selectBestPlaceCandidate = (
  location: Pick<PickupLocationForHours, "name" | "addressLine1" | "latitude" | "longitude">,
  candidates: GooglePlaceCandidate[]
): GooglePlaceCandidate | null => {
  const expectedStreetNumber = extractStreetNumber(location.addressLine1);

  const scored = candidates
    .map((candidate) => {
      const latitude = candidate.location?.latitude;
      const longitude = candidate.location?.longitude;
      if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return null;
      }

      const distance = distanceMeters(
        location.latitude,
        location.longitude,
        latitude,
        longitude
      );

      if (distance > PLACE_MATCH_MAX_DISTANCE_METERS) return null;

      const candidateAddress = candidate.formattedAddress || "";
      const candidateStreetNumber = extractStreetNumber(candidateAddress);
      if (
        expectedStreetNumber &&
        candidateStreetNumber &&
        expectedStreetNumber !== candidateStreetNumber
      ) {
        return null;
      }

      const nameScore = nameMatchScore(
        location.name,
        candidate.displayName?.text || ""
      );

      if (nameScore < 0.34) return null;

      return {
        candidate,
        score: nameScore * 1000 - distance,
        distance
      };
    })
    .filter(
      (
        result
      ): result is {
        candidate: GooglePlaceCandidate;
        score: number;
        distance: number;
      } => result !== null
    )
    .sort((a, b) => b.score - a.score);

  return scored[0]?.candidate ?? null;
};

const fetchWithTimeout = async (
  url: string,
  init: RequestInit
): Promise<Response> => {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), GOOGLE_PLACES_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: abortController.signal
    });
  } finally {
    clearTimeout(timeout);
  }
};

const findGooglePlaceId = async (
  location: PickupLocationForHours
): Promise<string | null> => {
  const textQuery = [
    location.name,
    location.addressLine1,
    location.city,
    location.province,
    "Canada"
  ]
    .filter(Boolean)
    .join(", ");

  const response = await fetchWithTimeout(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus"
      },
      body: JSON.stringify({
        textQuery,
        pageSize: 3,
        locationBias: {
          circle: {
            center: {
              latitude: location.latitude,
              longitude: location.longitude
            },
            radius: 300
          }
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Google Text Search failed with status ${response.status}`);
  }

  const data = (await response.json()) as GoogleTextSearchResponse;
  const bestMatch = selectBestPlaceCandidate(location, data.places ?? []);

  return bestMatch?.id ?? null;
};

const fetchGooglePlaceDetails = async (
  placeId: string
): Promise<GooglePlaceDetailsResponse> => {
  const response = await fetchWithTimeout(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,businessStatus,regularOpeningHours,currentOpeningHours"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Google Place Details failed with status ${response.status}`);
  }

  return (await response.json()) as GooglePlaceDetailsResponse;
};

const asInputJson = (
  value: GoogleOpeningHours | undefined
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput => {
  return value
    ? (value as unknown as Prisma.InputJsonValue)
    : Prisma.DbNull;
};

const truncateError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
};

type RefreshOptions = {
  forceRegular?: boolean;
  forceCurrent?: boolean;
  locationId?: string;
  now?: Date;
};

export const refreshPickupLocationHours = async (
  options: RefreshOptions = {}
): Promise<PickupLocationHoursRefreshSummary> => {
  const now = options.now ?? new Date();

  const summary: PickupLocationHoursRefreshSummary = {
    checked: 0,
    refreshed: 0,
    skipped: 0,
    failed: 0,
    placeIdsFound: 0,
    regularHoursRefreshed: 0,
    currentHoursRefreshed: 0
  };

  if (!env.GOOGLE_PLACES_API_KEY) {
    console.warn(
      "[Pickup Hours] GOOGLE_PLACES_API_KEY is not configured; refresh skipped."
    );
    return summary;
  }

  const locations = (await prisma.pickupLocation.findMany({
    where: options.locationId
      ? { id: options.locationId }
      : { isActive: true },
    orderBy: [{ city: "asc" }, { pickupType: "asc" }, { name: "asc" }]
  })) as PickupLocationForHours[];

  for (const location of locations) {
    const regularDue =
      options.forceRegular === true ||
      isHoursRefreshDue(
        location.regularHoursUpdatedAt,
        REGULAR_HOURS_REFRESH_MS,
        now
      );

    const currentDue =
      options.forceCurrent === true ||
      isHoursRefreshDue(
        location.currentHoursUpdatedAt,
        CURRENT_HOURS_REFRESH_MS,
        now
      );

    if (!regularDue && !currentDue) {
      summary.skipped += 1;
      continue;
    }

    if (
      !options.forceRegular &&
      !options.forceCurrent &&
      location.hoursLastCheckedAt &&
      now.getTime() - location.hoursLastCheckedAt.getTime() < FAILED_REFRESH_RETRY_MS &&
      ((regularDue && !location.regularHoursUpdatedAt) ||
        (currentDue && !location.currentHoursUpdatedAt))
    ) {
      summary.skipped += 1;
      continue;
    }

    summary.checked += 1;

    try {
      let placeId = location.googlePlaceId;

      if (!placeId) {
        placeId = await findGooglePlaceId(location);
        if (!placeId) {
          throw new Error(
            `No safe Google Places match found for ${location.name} at ${location.addressLine1}`
          );
        }
        summary.placeIdsFound += 1;
      }

      const details = await fetchGooglePlaceDetails(placeId);
      const missingHours: string[] = [];
      if (regularDue && !details.regularOpeningHours) missingHours.push("regular hours");
      if (currentDue && !details.currentOpeningHours) missingHours.push("current hours");

      await prisma.pickupLocation.update({
        where: { id: location.id },
        data: {
          googlePlaceId: details.id ?? placeId,
          googleBusinessStatus: details.businessStatus ?? null,
          ...(regularDue
            ? {
                regularOpeningHours: asInputJson(details.regularOpeningHours),
                regularHoursUpdatedAt: now
              }
            : {}),
          ...(currentDue
            ? {
                currentOpeningHours: asInputJson(details.currentOpeningHours),
                currentHoursUpdatedAt: now
              }
            : {}),
          hoursLastCheckedAt: now,
          hoursLastError:
            missingHours.length > 0
              ? `Google did not return ${missingHours.join(" and ")}.`
              : null
        }
      });

      summary.refreshed += 1;
      if (regularDue) summary.regularHoursRefreshed += 1;
      if (currentDue) summary.currentHoursRefreshed += 1;

      console.log(
        `[Pickup Hours][REFRESHED] ${location.name} | regular=${regularDue} current=${currentDue} placeId=${details.id ?? placeId}`
      );
    } catch (error) {
      summary.failed += 1;
      const errorMessage = truncateError(error);

      await prisma.pickupLocation
        .update({
          where: { id: location.id },
          data: {
            hoursLastCheckedAt: now,
            hoursLastError: errorMessage
          }
        })
        .catch((_error: unknown): void => {});

      console.error(
        `[Pickup Hours][FAILED] ${location.name} | ${errorMessage}`
      );
    }
  }

  console.log(
    `[Pickup Hours] Complete checked=${summary.checked} refreshed=${summary.refreshed} skipped=${summary.skipped} failed=${summary.failed} placeIdsFound=${summary.placeIdsFound} regular=${summary.regularHoursRefreshed} current=${summary.currentHoursRefreshed}`
  );

  return summary;
};

export const startPickupLocationHoursMonitor = (): (() => void) => {
  let stopped = false;
  let running = false;

  const run = async () => {
    if (stopped || running) return;
    running = true;

    try {
      await refreshPickupLocationHours();
    } catch (error) {
      console.error(
        "[Pickup Hours] Monitor run failed",
        error instanceof Error ? error.message : typeof error
      );
    } finally {
      running = false;
    }
  };

  const initialTimeout = setTimeout(() => {
    void run();
  }, INITIAL_MONITOR_DELAY_MS);
  initialTimeout.unref();

  const interval = setInterval(() => {
    void run();
  }, MONITOR_INTERVAL_MS);
  interval.unref();

  return () => {
    stopped = true;
    clearTimeout(initialTimeout);
    clearInterval(interval);
  };
};
