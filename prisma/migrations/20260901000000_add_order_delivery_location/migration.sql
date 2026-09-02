-- Additive delivery-location metadata. Existing orders remain valid with null values.
CREATE TYPE "DeliveryGeocodeStatus" AS ENUM ('VERIFIED', 'NEEDS_REVIEW', 'UNVERIFIED');

ALTER TABLE "Order"
ADD COLUMN "deliveryLatitude" DOUBLE PRECISION,
ADD COLUMN "deliveryLongitude" DOUBLE PRECISION,
ADD COLUMN "geocodeStatus" "DeliveryGeocodeStatus",
ADD COLUMN "geocodedAddress" TEXT,
ADD COLUMN "geocodePlaceId" TEXT,
ADD COLUMN "geocodeAddressFingerprint" TEXT;

CREATE INDEX "Order_geocodeStatus_idx" ON "Order"("geocodeStatus");
