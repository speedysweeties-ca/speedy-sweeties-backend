-- Add nullable tracking-token fields for newly created orders.
ALTER TABLE "Order"
ADD COLUMN "trackingTokenHash" TEXT,
ADD COLUMN "trackingTokenExpiresAt" TIMESTAMP(3);

-- PostgreSQL permits multiple NULL values, so historical orders remain valid.
CREATE UNIQUE INDEX "Order_trackingTokenHash_key"
ON "Order"("trackingTokenHash");
