-- Track one durable five-minute undispatched-order alert per order.
ALTER TABLE "Order"
ADD COLUMN "undispatchedAlertClaimedAt" TIMESTAMP(3),
ADD COLUMN "undispatchedAlertSentAt" TIMESTAMP(3);

CREATE INDEX "Order_undispatchedAlertSentAt_idx"
ON "Order"("undispatchedAlertSentAt");
