-- CreateTable
CREATE TABLE "OrderPickupStop" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "pickupLocationId" TEXT NOT NULL,
    "pickupType" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "plannedForDriverId" TEXT,
    "selectionSource" TEXT NOT NULL DEFAULT 'AUTO',
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "etaSeconds" INTEGER,
    "distanceMeters" INTEGER,
    "projectedArrivalAt" TIMESTAMP(3),
    "hoursSource" TEXT,
    "closingDate" TEXT,
    "closingTime" TEXT,
    "closingBufferMinutes" INTEGER NOT NULL DEFAULT 3,
    "storeName" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderPickupStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderPickupStop_orderId_pickupType_key" ON "OrderPickupStop"("orderId", "pickupType");

-- CreateIndex
CREATE INDEX "OrderPickupStop_orderId_idx" ON "OrderPickupStop"("orderId");

-- CreateIndex
CREATE INDEX "OrderPickupStop_pickupLocationId_idx" ON "OrderPickupStop"("pickupLocationId");

-- CreateIndex
CREATE INDEX "OrderPickupStop_plannedForDriverId_idx" ON "OrderPickupStop"("plannedForDriverId");

-- CreateIndex
CREATE INDEX "OrderPickupStop_sequence_idx" ON "OrderPickupStop"("sequence");

-- AddForeignKey
ALTER TABLE "OrderPickupStop" ADD CONSTRAINT "OrderPickupStop_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPickupStop" ADD CONSTRAINT "OrderPickupStop_pickupLocationId_fkey" FOREIGN KEY ("pickupLocationId") REFERENCES "PickupLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
