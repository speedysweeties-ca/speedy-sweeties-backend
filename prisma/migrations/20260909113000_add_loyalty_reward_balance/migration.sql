-- Preserve every outstanding historical reward before switching active redemption
-- to an explicit balance. The Boolean remains for existing API consumers.
ALTER TABLE "Customer"
ADD COLUMN "loyaltyRewardBalance" INTEGER NOT NULL DEFAULT 0;

UPDATE "Customer"
SET "loyaltyRewardBalance" = GREATEST(
  "loyaltyRewardsEarned" - "loyaltyRewardsUsed",
  CASE WHEN "loyaltyFreeDelivery" THEN 1 ELSE 0 END,
  0
);

UPDATE "Customer"
SET "loyaltyFreeDelivery" = ("loyaltyRewardBalance" > 0);
