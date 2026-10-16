-- Older entries remain unknown: order reuse/edits cannot prove original authorship.
-- These are audit snapshots, intentionally independent of staff account deletion.
ALTER TABLE "ItemCatalog"
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "createdByName" TEXT;
