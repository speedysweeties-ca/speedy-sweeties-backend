ALTER TABLE "Customer"
ADD COLUMN "loyaltyCompletedOrders" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Customer"
ADD COLUMN "loyaltyRewardsEarned" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Customer"
ADD COLUMN "loyaltyRewardsUsed" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Customer"
ADD COLUMN "loyaltyFreeDelivery" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Customer_loyaltyFreeDelivery_idx"
ON "Customer"("loyaltyFreeDelivery");