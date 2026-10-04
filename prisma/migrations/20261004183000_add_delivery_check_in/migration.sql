-- CreateEnum
CREATE TYPE "DeliveryHelpStatus" AS ENUM ('OPEN', 'HANDLED');

-- CreateEnum
CREATE TYPE "DeliveryCheckInEventType" AS ENUM ('VIEWED', 'REVIEW_CLICK', 'SHARE_CLICK', 'SHARE_COMPLETED');

-- CreateTable
CREATE TABLE "DeliveryHelpRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "DeliveryHelpStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),
    "handledByUserId" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "DeliveryHelpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryCheckInEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "DeliveryCheckInEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryCheckInEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryHelpRequest_orderId_key" ON "DeliveryHelpRequest"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryHelpRequest_status_createdAt_idx" ON "DeliveryHelpRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryHelpRequest_createdAt_idx" ON "DeliveryHelpRequest"("createdAt");

-- CreateIndex
CREATE INDEX "DeliveryCheckInEvent_createdAt_type_idx" ON "DeliveryCheckInEvent"("createdAt", "type");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryCheckInEvent_orderId_type_key" ON "DeliveryCheckInEvent"("orderId", "type");

-- AddForeignKey
ALTER TABLE "DeliveryHelpRequest" ADD CONSTRAINT "DeliveryHelpRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryHelpRequest" ADD CONSTRAINT "DeliveryHelpRequest_handledByUserId_fkey" FOREIGN KEY ("handledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryCheckInEvent" ADD CONSTRAINT "DeliveryCheckInEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
