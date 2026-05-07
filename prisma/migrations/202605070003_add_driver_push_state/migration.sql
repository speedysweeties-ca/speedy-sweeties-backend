ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "driverFcmToken" TEXT;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "driverAppState" TEXT DEFAULT 'FOREGROUND';

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "driverAppStateUpdatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_driverAppState_idx"
ON "User"("driverAppState");

CREATE INDEX IF NOT EXISTS "User_driverAppStateUpdatedAt_idx"
ON "User"("driverAppStateUpdatedAt");