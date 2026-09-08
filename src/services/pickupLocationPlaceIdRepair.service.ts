import { env } from "../config/env";
import { prisma } from "../lib/prisma";

const GOOGLE_TIMEOUT_MS = 6_000;
const CLAIR_MAX_DISTANCE_METERS = 150;

const VERIFIED_PLACE_IDS = [
  {
    name: "The Beer Store - Silvercreek Parkway North",
    addressLine1: "111 Silvercreek Parkway North",
    googlePlaceId: "ChIJeRwzhQiQK4gRnJfb3zun-Qo"
  },
  {
    name: "Circle K - College Avenue West",
    addressLine1: "138 College Avenue West",
    googlePlaceId: "ChIJ7eugbS2FK4gRvvLX27IEagY"
  },
  {
    name: "Quickie - Willow Road",
    addressLine1: "61 Willow Rd",
    googlePlaceId: "ChIJdVrUPqGaK4gR5M1v3KW-xC0"
  },
  {
    name: "J. Supply Co. - Gordon Street",
    addressLine1: "1515 Gordon Street Unit 106",
    googlePlaceId: "ChIJYdUhh6SEK4gRi5SfGfv7-3I"
  },
  {
    name: "PUR Cannabis - Wyndham Street North",
    addressLine1: "37A Wyndham Street North",
    googlePlaceId: "ChIJY8zEzHebK4gRxHDIpEP6ENk"
  }
] as const;

const CLAIR_BEER_STORE = {
  name: "The Beer Store - Clair Road East",
  addressLine1: "63 Clair Road East"
} as const;

type PlaceCandidate = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
};

type TextSearchResponse = {
  places?: PlaceCandidate[];
};

const normalizeText = (value: string | null | undefined): string =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

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

export const selectExactClairBeerStoreCandidate = (
  latitude: number,
  longitude: number,
  candidates: PlaceCandidate[]
): PlaceCandidate | null => {
  const matches = candidates.filter((candidate) => {
    const candidateLatitude = candidate.location?.latitude;
    const candidateLongitude = candidate.location?.longitude;

    if (
      typeof candidateLatitude !== "number" ||
      typeof candidateLongitude !== "number" ||
      !Number.isFinite(candidateLatitude) ||
      !Number.isFinite(candidateLongitude)
    ) {
      return false;
    }

    const name = normalizeText(candidate.displayName?.text);
    const address = normalizeText(candidate.formattedAddress);

    if (!name.includes("beer store")) return false;
    if (!/\b63\b/.test(address)) return false;
    if (!address.includes("clair")) return false;
    if (!address.includes("guelph")) return false;

    return (
      distanceMeters(
        latitude,
        longitude,
        candidateLatitude,
        candidateLongitude
      ) <= CLAIR_MAX_DISTANCE_METERS
    );
  });

  return matches.length === 1 ? matches[0] : null;
};

const findClairBeerStorePlaceId = async (
  latitude: number,
  longitude: number
): Promise<string | null> => {
  if (!env.GOOGLE_PLACES_API_KEY) return null;

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), GOOGLE_TIMEOUT_MS);

  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        signal: abortController.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location"
        },
        body: JSON.stringify({
          textQuery:
            "Beer Store 4009, 63 Clair Road East, Guelph, Ontario, Canada",
          pageSize: 5,
          locationBias: {
            circle: {
              center: { latitude, longitude },
              radius: 250
            }
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        `Google Text Search for Clair Beer Store failed with status ${response.status}`
      );
    }

    const data = (await response.json()) as TextSearchResponse;
    const candidate = selectExactClairBeerStoreCandidate(
      latitude,
      longitude,
      data.places ?? []
    );

    return candidate?.id ?? null;
  } finally {
    clearTimeout(timeout);
  }
};

const applyPlaceId = async (
  id: string,
  googlePlaceId: string
): Promise<void> => {
  await prisma.pickupLocation.update({
    where: { id },
    data: {
      googlePlaceId,
      regularOpeningHours: undefined,
      currentOpeningHours: undefined,
      regularHoursUpdatedAt: null,
      currentHoursUpdatedAt: null,
      hoursLastCheckedAt: null,
      hoursLastError: null
    }
  });
};

export const repairUnresolvedPickupLocationPlaceIds = async (): Promise<void> => {
  for (const repair of VERIFIED_PLACE_IDS) {
    const location = await prisma.pickupLocation.findFirst({
      where: {
        name: repair.name,
        addressLine1: repair.addressLine1,
        googlePlaceId: null
      },
      select: { id: true }
    });

    if (!location) continue;

    try {
      await applyPlaceId(location.id, repair.googlePlaceId);
      console.log(
        `[Pickup Hours][PLACE ID REPAIRED] ${repair.name} | ${repair.googlePlaceId}`
      );
    } catch (error) {
      console.error(
        `[Pickup Hours][PLACE ID REPAIR FAILED] ${repair.name} | ${
          error instanceof Error ? error.message : typeof error
        }`
      );
    }
  }

  const clairLocation = await prisma.pickupLocation.findFirst({
    where: {
      name: CLAIR_BEER_STORE.name,
      addressLine1: CLAIR_BEER_STORE.addressLine1,
      googlePlaceId: null
    },
    select: {
      id: true,
      latitude: true,
      longitude: true
    }
  });

  if (!clairLocation) return;

  try {
    const googlePlaceId = await findClairBeerStorePlaceId(
      clairLocation.latitude,
      clairLocation.longitude
    );

    if (!googlePlaceId) {
      console.warn(
        "[Pickup Hours][PLACE ID REPAIR SKIPPED] The Beer Store - Clair Road East | no unique exact Google match"
      );
      return;
    }

    await applyPlaceId(clairLocation.id, googlePlaceId);
    console.log(
      `[Pickup Hours][PLACE ID REPAIRED] The Beer Store - Clair Road East | ${googlePlaceId}`
    );
  } catch (error) {
    console.error(
      `[Pickup Hours][PLACE ID REPAIR FAILED] The Beer Store - Clair Road East | ${
        error instanceof Error ? error.message : typeof error
      }`
    );
  }
};
