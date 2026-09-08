import { prisma } from "../lib/prisma";
import { geocodeDeliveryAddress } from "./deliveryGeocoding.service";
import { GUELPH_PICKUP_DRY_RUN_LOCATIONS } from "../data/guelphPickupDryRunLocations";

const MATCH_DISTANCE_METERS = 75;

const normalize = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

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

export type PickupLocationDryRunSummary = {
  create: number;
  update: number;
  unchanged: number;
  skip: number;
  total: number;
};

export const runPickupLocationDryRun = async (): Promise<PickupLocationDryRunSummary> => {
  const summary: PickupLocationDryRunSummary = {
    create: 0,
    update: 0,
    unchanged: 0,
    skip: 0,
    total: GUELPH_PICKUP_DRY_RUN_LOCATIONS.length
  };

  console.log(`[Pickup Location Dry Run] Starting ${summary.total} locations. NO WRITES WILL OCCUR.`);

  for (const location of GUELPH_PICKUP_DRY_RUN_LOCATIONS) {
    const geocoded = await geocodeDeliveryAddress({
      addressLine1: location.addressLine1,
      city: location.city,
      province: location.province
    });

    if (
      geocoded.geocodeStatus !== "VERIFIED" ||
      geocoded.deliveryLatitude === null ||
      geocoded.deliveryLongitude === null
    ) {
      summary.skip += 1;
      console.warn(`[Pickup Location Dry Run][SKIP] ${location.name} | ${location.addressLine1}`);
      continue;
    }

    const candidates = await prisma.pickupLocation.findMany({
      where: {
        pickupType: location.pickupType,
        city: { equals: location.city, mode: "insensitive" }
      }
    });

    const normalizedAddress = normalize(location.addressLine1);
    const normalizedName = normalize(location.name);
    const existing = candidates.find((candidate) => {
      if (normalize(candidate.addressLine1) === normalizedAddress) {
        return true;
      }

      return (
        normalize(candidate.name) === normalizedName &&
        distanceMeters(
          candidate.latitude,
          candidate.longitude,
          geocoded.deliveryLatitude as number,
          geocoded.deliveryLongitude as number
        ) <= MATCH_DISTANCE_METERS
      );
    });

    if (!existing) {
      summary.create += 1;
      console.log(
        `[Pickup Location Dry Run][CREATE] ${location.name} | ${location.addressLine1} | ${geocoded.deliveryLatitude},${geocoded.deliveryLongitude}`
      );
      continue;
    }

    const wouldChange =
      existing.name !== location.name ||
      existing.addressLine1 !== location.addressLine1 ||
      existing.city !== location.city ||
      existing.province !== location.province ||
      (existing.postalCode ?? undefined) !== location.postalCode ||
      existing.latitude !== geocoded.deliveryLatitude ||
      existing.longitude !== geocoded.deliveryLongitude ||
      existing.isActive !== true;

    if (wouldChange) {
      summary.update += 1;
      console.log(
        `[Pickup Location Dry Run][UPDATE] ${location.name} | existing=${existing.id} | ${location.addressLine1} | ${geocoded.deliveryLatitude},${geocoded.deliveryLongitude}`
      );
    } else {
      summary.unchanged += 1;
      console.log(`[Pickup Location Dry Run][UNCHANGED] ${location.name} | existing=${existing.id}`);
    }
  }

  console.log(
    `[Pickup Location Dry Run] Complete total=${summary.total} create=${summary.create} update=${summary.update} unchanged=${summary.unchanged} skip=${summary.skip}. NO WRITES OCCURRED.`
  );

  return summary;
};
