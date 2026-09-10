CREATE TYPE "PickupLocationRoutingPriority" AS ENUM ('PREFERRED', 'STANDARD', 'FALLBACK');

ALTER TABLE "PickupLocation"
ADD COLUMN "routingPriority" "PickupLocationRoutingPriority" NOT NULL DEFAULT 'STANDARD';

CREATE INDEX "PickupLocation_routingPriority_idx"
ON "PickupLocation"("routingPriority");
