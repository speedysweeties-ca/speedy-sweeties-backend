import { DeliveryGeocodeStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  createDeliveryAddressFingerprint,
  DeliveryAddressValidationError,
  geocodeDeliveryAddress
} from "../services/deliveryGeocoding.service";

const args = new Set(process.argv.slice(2));
const applyChanges = args.has("--apply");
const limitArgument = process.argv.find((argument) =>
  argument.startsWith("--limit=")
);
const parsedLimit = Number(limitArgument?.split("=")[1] ?? 500);
const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
  ? Math.min(parsedLimit, 5_000)
  : 500;

const run = async (): Promise<void> => {
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { geocodeStatus: null },
        { geocodeStatus: DeliveryGeocodeStatus.NEEDS_REVIEW },
        {
          geocodeStatus: DeliveryGeocodeStatus.VERIFIED,
          OR: [
            { deliveryLatitude: null },
            { deliveryLongitude: null },
            { geocodeAddressFingerprint: null }
          ]
        }
      ]
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      addressLine1: true,
      city: true,
      province: true,
      deliveryLatitude: true,
      deliveryLongitude: true,
      geocodeStatus: true,
      geocodeAddressFingerprint: true
    }
  });

  let skipped = 0;
  let verified = 0;
  let needsReview = 0;
  let invalid = 0;
  let changedDuringRun = 0;

  for (const order of orders) {
    const address = {
      addressLine1: order.addressLine1,
      city: order.city,
      province: order.province
    };
    const fingerprint = createDeliveryAddressFingerprint(address);
    const isCurrentVerifiedLocation =
      order.geocodeStatus === DeliveryGeocodeStatus.VERIFIED &&
      order.deliveryLatitude !== null &&
      order.deliveryLongitude !== null &&
      order.geocodeAddressFingerprint === fingerprint;

    if (isCurrentVerifiedLocation) {
      skipped += 1;
      continue;
    }

    try {
      const location = await geocodeDeliveryAddress(address);

      if (location.geocodeStatus === DeliveryGeocodeStatus.VERIFIED) {
        verified += 1;
      } else {
        needsReview += 1;
      }

      if (applyChanges) {
        const update = await prisma.order.updateMany({
          where: {
            id: order.id,
            addressLine1: order.addressLine1,
            city: order.city,
            province: order.province
          },
          data: location
        });
        if (update.count === 0) changedDuringRun += 1;
      }
    } catch (error) {
      if (!(error instanceof DeliveryAddressValidationError)) throw error;
      invalid += 1;

      if (applyChanges) {
        const update = await prisma.order.updateMany({
          where: {
            id: order.id,
            addressLine1: order.addressLine1,
            city: order.city,
            province: order.province
          },
          data: {
            deliveryLatitude: null,
            deliveryLongitude: null,
            geocodeStatus: DeliveryGeocodeStatus.UNVERIFIED,
            geocodedAddress: null,
            geocodePlaceId: null,
            geocodeAddressFingerprint: fingerprint
          }
        });
        if (update.count === 0) changedDuringRun += 1;
      }
    }
  }

  console.log(
    `Delivery-location backfill ${applyChanges ? "apply" : "dry-run"}: ` +
      `examined=${orders.length}, verified=${verified}, needsReview=${needsReview}, ` +
      `invalid=${invalid}, skippedCurrent=${skipped}, changedDuringRun=${changedDuringRun}.`
  );
};

run()
  .catch((error) => {
    console.error(
      "Delivery-location backfill failed:",
      error instanceof Error ? error.name : typeof error
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
