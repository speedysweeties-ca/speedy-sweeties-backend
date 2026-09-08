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

type VerifiedPickupLocation = (typeof GUELPH_PICKUP_DRY_RUN_LOCATIONS)[number] & {
  latitude: number;
  longitude: number;
};

export type PickupLocationApplySummary = {
  create: number;
  update: number;
  unchanged: number;
  total: number;
};

export const runPickupLocationApply = async (): Promise<PickupLocationApplySummary> => {
  console.log(
    `[Pickup Location Apply] Verifying all ${GUELPH_PICKUP_DRY_RUN_LOCATIONS.length} locations before any database write.`
  );

  const verifiedLocations: VerifiedPickupLocation[] = [];

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
      throw new Error(
        `Pickup Location apply aborted before writes because geocoding failed for ${location.name}`
      );
    }

    verifiedLocations.push({
      ...location,
      latitude: geocoded.deliveryLatitude,
      longitude: geocoded.deliveryLongitude
    });
  }

  console.log(
    `[Pickup Location Apply] All ${verifiedLocations.length} locations verified. Beginning idempotent create/update pass.`
  );

  const existingLocations = await prisma.pickupLocation.findMany({
    where: {
      city: { equals: "Guelph", mode: "insensitive" }
    }
  });

  const summary: PickupLocationApplySummary = {
    create: 0,
    update: 0,
    unchanged: 0,
    total: verifiedLocations.length
  };

  for (const location of verifiedLocations) {
    const normalizedAddress = normalize(location.addressLine1);
    const normalizedName = normalize(location.name);

    const existing = existingLocations.find((candidate) => {
      if (candidate.pickupType !== location.pickupType) {
        return false;
      }

      if (normalize(candidate.addressLine1) === normalizedAddress) {
        return true;
      }

      return (
        normalize(candidate.name) === normalizedName &&
        distanceMeters(
          candidate.latitude,
          candidate.longitude,
          location.latitude,
          location.longitude
        ) <= MATCH_DISTANCE_METERS
      );
    });

    if (!existing) {
      const created = await prisma.pickupLocation.create({
        data: {
          name: location.name,
          pickupType: location.pickupType,
          addressLine1: location.addressLine1,
          city: location.city,
          province: location.province,
          postalCode: location.postalCode,
          latitude: location.latitude,
          longitude: location.longitude,
          isActive: true
        }
      });

      existingLocations.push(created);
      summary.create += 1;
      console.log(
        `[Pickup Location Apply][CREATE] ${location.name} | ${location.addressLine1} | ${created.id}`
      );
      continue;
    }

    const wouldChange =
      existing.name !== location.name ||
      existing.addressLine1 !== location.addressLine1 ||
      existing.city !== location.city ||
      existing.province !== location.province ||
      (existing.postalCode ?? undefined) !== location.postalCode ||
      existing.latitude !== location.latitude ||
      existing.longitude !== location.longitude ||
      existing.isActive !== true;

    if (!wouldChange) {
      summary.unchanged += 1;
      console.log(
        `[Pickup Location Apply][UNCHANGED] ${location.name} | ${existing.id}`
      );
      continue;
    }

    const updated = await prisma.pickupLocation.update({
      where: { id: existing.id },
      data: {
        name: location.name,
        pickupType: location.pickupType,
        addressLine1: location.addressLine1,
        city: location.city,
        province: location.province,
        postalCode: location.postalCode,
        latitude: location.latitude,
        longitude: location.longitude,
        isActive: true
      }
    });

    const index = existingLocations.findIndex((candidate) => candidate.id === updated.id);
    if (index >= 0) {
      existingLocations[index] = updated;
    }

    summary.update += 1;
    console.log(
      `[Pickup Location Apply][UPDATE] ${location.name} | ${updated.id}`
    );
  }

  console.log(
    `[Pickup Location Apply] Complete total=${summary.total} create=${summary.create} update=${summary.update} unchanged=${summary.unchanged}.`
  );

  return summary;
};
