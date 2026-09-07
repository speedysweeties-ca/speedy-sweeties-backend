-- Record the ordering surface and optional campaign tags without changing existing orders.
-- Historical orders remain UNKNOWN so reporting never guesses where they came from.
CREATE TYPE "OrderSource" AS ENUM (
  'UNKNOWN',
  'ANDROID_APP',
  'IOS_APP',
  'WEBFLOW',
  'DISPATCHER_MANUAL'
);

ALTER TABLE "Order"
ADD COLUMN "orderSource" "OrderSource" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "utmSource" TEXT,
ADD COLUMN "utmMedium" TEXT,
ADD COLUMN "utmCampaign" TEXT,
ADD COLUMN "utmContent" TEXT,
ADD COLUMN "utmTerm" TEXT,
ADD COLUMN "referralCode" TEXT;

CREATE INDEX "Order_orderSource_idx" ON "Order"("orderSource");
CREATE INDEX "Order_utmSource_idx" ON "Order"("utmSource");
CREATE INDEX "Order_utmCampaign_idx" ON "Order"("utmCampaign");
CREATE INDEX "Order_referralCode_idx" ON "Order"("referralCode");
