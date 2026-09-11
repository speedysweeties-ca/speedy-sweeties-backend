-- Restore the operator-requested Auto Dispatch state after the routing repair.
-- This runs once; the authenticated dispatcher toggle can still change it later.

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('autoDispatchEnabled', 'true', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET
  "value" = 'true',
  "updatedAt" = CURRENT_TIMESTAMP;
