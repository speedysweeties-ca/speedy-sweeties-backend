import { prisma } from "../lib/prisma";
import { GUELPH_CORE_PICKUP_LOCATIONS } from "../data/guelphPickupLocations";
import { geocodeDeliveryAddress } from "../services/deliveryGeocoding.service";
import { isSamePickupLocation } from "../services/pickupLocationSeedMatching.service";

const applyChanges = process.env.PICKUP_LOCATION_SEED_APPLY === "true";

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

    const existing = existingCandidates.find((candidate) =>
      isSamePickupLocation(candidate, {
        name: seedLocation.name,
        addressLine1: seedLocation.addressLine1,
        latitude: geocoded.deliveryLatitude as number,
        longitude: geocoded.deliveryLongitude as number
      })
    );

    const desiredData = {
      name: seedLocation.name,
      pickupType: seedLocation.pickupType,
      addressLine1: seedLocation.addressLine1,
      city: seedLocation.city,
      province: seedLocation.province,
      postalCode: seedLocation.postalCode ?? null,
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
