-- Track which Toronto calendar month the customer's loyalty progress belongs to.
ALTER TABLE "Customer"
ADD COLUMN IF NOT EXISTS "loyaltyProgressMonth" TEXT;

-- Preserve every customer's current progress during this rollout.
-- The first full automatic reset will happen on the next Toronto calendar month.
UPDATE "Customer"
SET "loyaltyProgressMonth" =
  TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto', 'YYYY-MM')
WHERE "loyaltyProgressMonth" IS NULL;