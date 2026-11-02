-- Durable privacy access is separate from short-lived order tracking and from
-- deletion-status credentials. It identifies a reviewed customer/source order,
-- but a fresh channel challenge is still required for destructive action.
ALTER TABLE "PrivacyChallenge"
ADD COLUMN "sourceOrderId" TEXT,
ADD COLUMN "accessId" TEXT,
ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'DELETE',
ADD COLUMN "channel" TEXT,
ADD COLUMN "destinationHash" TEXT,
ADD COLUMN "providerReference" TEXT,
ADD COLUMN "completionTimeframe" TEXT;

ALTER TABLE "PrivacyDeletionRequest"
ADD COLUMN "sourceOrderId" TEXT NOT NULL DEFAULT 'legacy-unconfigured',
ADD COLUMN "completionTimeframe" TEXT NOT NULL DEFAULT 'Not configured';
ALTER TABLE "PrivacyDeletionRequest"
ALTER COLUMN "sourceOrderId" DROP DEFAULT,
ALTER COLUMN "completionTimeframe" DROP DEFAULT;

CREATE TABLE "PrivacyAccessCredential" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceOrderId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "destinationHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "PrivacyAccessCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrivacyAccessCredential_tokenHash_key"
ON "PrivacyAccessCredential"("tokenHash");

CREATE INDEX "PrivacyAccessCredential_customerId_revokedAt_idx"
ON "PrivacyAccessCredential"("customerId", "revokedAt");

ALTER TABLE "PrivacyAccessCredential"
ADD CONSTRAINT "PrivacyAccessCredential_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
