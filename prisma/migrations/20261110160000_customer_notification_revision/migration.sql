-- Additive only. Existing iOS/Android order creation and notification associations remain valid.
ALTER TABLE "Order" ADD COLUMN "fcmTokenRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "fcmTokenMutationId" TEXT;
