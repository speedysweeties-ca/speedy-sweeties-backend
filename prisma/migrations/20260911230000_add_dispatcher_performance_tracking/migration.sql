-- Add durable dispatcher-performance attribution without changing existing orders.
-- Historical values remain nullable so reports never guess missing ownership or timing.
CREATE TYPE "DispatchEventType" AS ENUM ('ASSIGNED', 'REASSIGNED', 'UNASSIGNED');

ALTER TABLE "Order"
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "manualEntryStartedAt" TIMESTAMP(3);

CREATE TABLE "DispatchEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "eventType" "DispatchEventType" NOT NULL,
  "dispatchSource" "DispatchSource" NOT NULL,
  "actorUserId" TEXT,
  "fromDriverId" TEXT,
  "toDriverId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DispatchEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Order_createdByUserId_idx" ON "Order"("createdByUserId");
CREATE INDEX "Order_manualEntryStartedAt_idx" ON "Order"("manualEntryStartedAt");
CREATE INDEX "DispatchEvent_orderId_occurredAt_idx" ON "DispatchEvent"("orderId", "occurredAt");
CREATE INDEX "DispatchEvent_actorUserId_occurredAt_idx" ON "DispatchEvent"("actorUserId", "occurredAt");
CREATE INDEX "DispatchEvent_eventType_idx" ON "DispatchEvent"("eventType");
CREATE INDEX "DispatchEvent_dispatchSource_idx" ON "DispatchEvent"("dispatchSource");
CREATE INDEX "DispatchEvent_fromDriverId_idx" ON "DispatchEvent"("fromDriverId");
CREATE INDEX "DispatchEvent_toDriverId_idx" ON "DispatchEvent"("toDriverId");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DispatchEvent"
ADD CONSTRAINT "DispatchEvent_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DispatchEvent"
ADD CONSTRAINT "DispatchEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DispatchEvent"
ADD CONSTRAINT "DispatchEvent_fromDriverId_fkey"
FOREIGN KEY ("fromDriverId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DispatchEvent"
ADD CONSTRAINT "DispatchEvent_toDriverId_fkey"
FOREIGN KEY ("toDriverId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
