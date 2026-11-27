-- Nullable for receipts saved before item-snapshot validation.
ALTER TABLE "DigitalReceipt" ADD COLUMN "itemsFingerprint" TEXT;
