ALTER TABLE "Order"
ADD COLUMN "cancelledAt" TIMESTAMP(3);

ALTER TABLE "Order"
ADD COLUMN "cancelledFromStatus" "OrderStatus";

ALTER TABLE "Order"
ADD COLUMN "cancellationReason" TEXT;

CREATE INDEX "Order_cancelledAt_idx"
ON "Order"("cancelledAt");

CREATE INDEX "Order_cancelledFromStatus_idx"
ON "Order"("cancelledFromStatus");