-- Existing staff keep their passwords and sessions until an administrator changes access.
ALTER TABLE "User"
ADD COLUMN "staffRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "passwordChangeRequired" BOOLEAN NOT NULL DEFAULT false;
