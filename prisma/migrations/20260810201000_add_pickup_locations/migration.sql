-- CreateTable
CREATE TABLE "PickupLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pickupType" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PickupLocation_pickupType_idx" ON "PickupLocation"("pickupType");

-- CreateIndex
CREATE INDEX "PickupLocation_isActive_idx" ON "PickupLocation"("isActive");

-- CreateIndex
CREATE INDEX "PickupLocation_city_idx" ON "PickupLocation"("city");