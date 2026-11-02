-- Store the adopted 30-calendar-day service deadline on each verified request.
ALTER TABLE "PrivacyDeletionRequest"
ADD COLUMN "dueAt" TIMESTAMP(3);

UPDATE "PrivacyDeletionRequest"
SET "dueAt" = "createdAt" + INTERVAL '30 days'
WHERE "dueAt" IS NULL;

ALTER TABLE "PrivacyDeletionRequest"
ALTER COLUMN "dueAt" SET NOT NULL;

CREATE INDEX "PrivacyDeletionRequest_status_dueAt_idx"
ON "PrivacyDeletionRequest"("status", "dueAt");

-- External-copy outcomes need machine-readable expiry/review metadata. No
-- provider or backup period is defaulted by this migration.
ALTER TABLE "PrivacyExternalTask"
ADD COLUMN "retainUntil" TIMESTAMP(3),
ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- Receipt notes accept arbitrary staff text. During a verified deletion, only
-- recognized receipt-charge facts are copied here before the original free text
-- is removed; no historical rows are changed by this additive migration.
ALTER TABLE "DigitalReceipt"
ADD COLUMN "retainedChargeEvidence" JSONB;
