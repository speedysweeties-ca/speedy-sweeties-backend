-- Add an auditable source URL for products verified on approved retailer sites.
ALTER TABLE "ItemCatalog"
ADD COLUMN "webVerificationUrl" TEXT,
ADD COLUMN "webVerifiedAt" TIMESTAMP(3);

-- A retailer product page can establish only one catalog record.
CREATE UNIQUE INDEX "ItemCatalog_webVerificationUrl_key"
ON "ItemCatalog"("webVerificationUrl");

CREATE INDEX "ItemCatalog_webVerifiedAt_idx"
ON "ItemCatalog"("webVerifiedAt");
