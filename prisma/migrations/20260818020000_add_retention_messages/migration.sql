-- Phase 3A: 90-day customer retention message foundation.
-- Safe-mode only: this migration creates tracking/consent fields and does not send SMS.

CREATE TYPE "RetentionMessageStatus" AS ENUM ('DRY_RUN', 'SENT', 'FAILED');

ALTER TABLE "Customer"
ADD COLUMN "smsMarketingOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "smsMarketingOptOutAt" TIMESTAMP(3),
ADD COLUMN "smsExpressConsentAt" TIMESTAMP(3),
ADD COLUMN "smsExpressConsentSource" TEXT;

CREATE TABLE "RetentionMessage" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "triggerDays" INTEGER NOT NULL DEFAULT 90,
    "inactivityAnchorAt" TIMESTAMP(3) NOT NULL,
    "eligibleAt" TIMESTAMP(3) NOT NULL,
    "phone" TEXT NOT NULL,
    "messageBody" TEXT NOT NULL,
    "status" "RetentionMessageStatus" NOT NULL DEFAULT 'DRY_RUN',
    "consentBasis" TEXT,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetentionMessage_customerId_triggerDays_inactivityAnchorAt_key"
ON "RetentionMessage"("customerId", "triggerDays", "inactivityAnchorAt");

CREATE INDEX "RetentionMessage_customerId_idx" ON "RetentionMessage"("customerId");
CREATE INDEX "RetentionMessage_status_idx" ON "RetentionMessage"("status");
CREATE INDEX "RetentionMessage_eligibleAt_idx" ON "RetentionMessage"("eligibleAt");
CREATE INDEX "RetentionMessage_sentAt_idx" ON "RetentionMessage"("sentAt");
CREATE INDEX "RetentionMessage_returnedAt_idx" ON "RetentionMessage"("returnedAt");
CREATE INDEX "Customer_smsMarketingOptOut_idx" ON "Customer"("smsMarketingOptOut");

ALTER TABLE "RetentionMessage"
ADD CONSTRAINT "RetentionMessage_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;