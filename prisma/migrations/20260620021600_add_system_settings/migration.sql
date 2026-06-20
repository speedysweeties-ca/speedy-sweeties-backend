-- Phase 2 auto-dispatch toggle
-- Adds a tiny settings table so the dispatcher page can turn auto-dispatch ON/OFF.

CREATE TABLE "SystemSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "SystemSetting_updatedAt_idx" ON "SystemSetting"("updatedAt");
