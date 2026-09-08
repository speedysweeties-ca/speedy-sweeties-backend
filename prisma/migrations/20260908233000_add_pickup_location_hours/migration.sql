-- Add Google Places identifiers and cached hours to pickup locations.
ALTER TABLE "PickupLocation"
  ADD COLUMN "googlePlaceId" TEXT,
  ADD COLUMN "googleBusinessStatus" TEXT,
  ADD COLUMN "regularOpeningHours" JSONB,
  ADD COLUMN "currentOpeningHours" JSONB,
  ADD COLUMN "regularHoursUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "currentHoursUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "hoursLastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "hoursLastError" TEXT,
  ADD COLUMN "manualHoursOverride" JSONB,
  ADD COLUMN "manualHoursOverrideNote" TEXT,
  ADD COLUMN "manualHoursOverrideUpdatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "PickupLocation_googlePlaceId_key"
  ON "PickupLocation"("googlePlaceId");

CREATE INDEX "PickupLocation_regularHoursUpdatedAt_idx"
  ON "PickupLocation"("regularHoursUpdatedAt");

CREATE INDEX "PickupLocation_currentHoursUpdatedAt_idx"
  ON "PickupLocation"("currentHoursUpdatedAt");

CREATE INDEX "PickupLocation_hoursLastCheckedAt_idx"
  ON "PickupLocation"("hoursLastCheckedAt");
