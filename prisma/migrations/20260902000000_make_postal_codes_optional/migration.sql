-- Preserve all existing postal-code values while allowing new records to omit them.
ALTER TABLE "Customer" ALTER COLUMN "postalCode" DROP NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "postalCode" DROP NOT NULL;
ALTER TABLE "PickupLocation" ALTER COLUMN "postalCode" DROP NOT NULL;
