import { prisma } from "../lib/prisma";
import { GUELPH_CORE_PICKUP_LOCATIONS } from "../data/guelphPickupLocations";
import { geocodeDeliveryAddress } from "../services/deliveryGeocoding.service";

const applyChanges = process.env.PICKUP_LOCATION_SEED_APPLY === "true";
const MATCH_DISTANCE_METERS = 75;

const normalizeAddress = (value: string): string =>
  value
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

const main = async (): Promise<void> => {
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  console.log(
    `Pickup Location seed starting in ${applyChanges ? "APPLY" : "DRY-RUN"} mode.`
  );

  for (const seedLocation of GUELPH_CORE_PICKUP_LOCATIONS) {
    const geocoded = await geocodeDeliveryAddress({
      addressLine1: seedLocation.addressLine1,
      city: seedLocation.city,
      province: seedLocation.province
    });

    if (
      geocoded.geocodeStatus !== "VERIFIED" ||
      geocoded.deliveryLatitude === null ||
      geocoded.deliveryLongitude === null
    ) {
      skipped += 1;
      console.warn(
        `[SKIP] ${seedLocation.name}: address could not be verified by the backend geocoder.`
      );
      continue;
    }

    const existingCandidates = await prisma.pickupLocation.findMany({
      where: {
        pickupType: seedLocation.pickupType,
        city: {
          equals: seedLocation.city,
          mode: "insensitive"
        }
      }
    });

    const normalizedSeedAddress = normalizeAddress(seedLocation.addressLine1);
    const existing = existingCandidates.find((candidate) => {
      if (normalizeAddress(candidate.addressLine1) === normalizedSeedAddress) {
        return true;
      }

      return (
        distanceMeters(
          candidate.latitude,
          candidate.longitude,
          geocoded.deliveryLatitude as number,
          geocoded.deliveryLongitude as number
        ) <= MATCH_DISTANCE_METERS
      );
    });

    const desiredData = {
      name: seedLocation.name,
      pickupType: seedLocation.pickupType,
      addressLine1: seedLocation.addressLine1,
      city: seedLocation.city,
      province: seedLocation.province,
      postalCode: seedLocation.postalCode,
      latitude: geocoded.deliveryLatitude,
      longitude: geocoded.deliveryLongitude,
      isActive: true
    };

    if (!existing) {
      if (applyChanges) {
        await prisma.pickupLocation.create({ data: desiredData });
      }

      created += 1;
      console.log(`[CREATE] ${seedLocation.name}`);
      continue;
    }

    const hasChanges =
      existing.name !== desiredData.name ||
      existing.addressLine1 !== desiredData.addressLine1 ||
      existing.city !== desiredData.city ||
      existing.province !== desiredData.province ||
      existing.postalCode !== desiredData.postalCode ||
      existing.latitude !== desiredData.latitude ||
      existing.longitude !== desiredData.longitude ||
      existing.isActive !== desiredData.isActive;

    if (!hasChanges) {
      unchanged += 1;
      console.log(`[UNCHANGED] ${seedLocation.name}`);
      continue;
    }

    if (applyChanges) {
      await prisma.pickupLocation.update({
        where: { id: existing.id },
        data: desiredData
      });
    }

    updated += 1;
    console.log(`[UPDATE] ${seedLocation.name}`);
  }

  console.log(
    `Pickup Location seed complete: created=${created}, updated=${updated}, unchanged=${unchanged}, skipped=${skipped}.`
  );

  if (!applyChanges) {
    console.log(
      "Dry-run only. Set PICKUP_LOCATION_SEED_APPLY=true to persist these changes."
    );
  }
};

main()
  .catch((error) => {
    console.error("Pickup Location seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
