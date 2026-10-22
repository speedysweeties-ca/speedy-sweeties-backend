CREATE TABLE "BndMonitorCheck" (
  "checkedAt" TIMESTAMP(3) NOT NULL,
  "pendingCount" INTEGER NOT NULL,
  CONSTRAINT "BndMonitorCheck_pkey" PRIMARY KEY ("checkedAt"),
  CONSTRAINT "BndMonitorCheck_nonnegative" CHECK ("pendingCount" >= 0)
);

CREATE TABLE "BndWaitingPeriod" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL,
  "lastSeenWaitingAt" TIMESTAMP(3) NOT NULL,
  "overFiveMinutesAt" TIMESTAMP(3),
  "endObservedAt" TIMESTAMP(3),
  "endReason" TEXT,
  CONSTRAINT "BndWaitingPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BndWaitingPeriod_times" CHECK (
    "lastSeenWaitingAt" >= "firstSeenAt"
    AND ("overFiveMinutesAt" IS NULL OR (
      "overFiveMinutesAt" > "firstSeenAt" + INTERVAL '5 minutes'
      AND "overFiveMinutesAt" <= "lastSeenWaitingAt"))
    AND (("endObservedAt" IS NULL AND "endReason" IS NULL) OR (
      "endObservedAt" IS NOT NULL AND "endReason" IS NOT NULL
      AND "endObservedAt" >= "lastSeenWaitingAt" AND "endReason" IN ('CLAIMED', 'MISSING', 'GAP')))
  )
);
CREATE INDEX "BndWaitingPeriod_orderId_firstSeenAt_idx" ON "BndWaitingPeriod"("orderId", "firstSeenAt");
CREATE INDEX "BndWaitingPeriod_overFiveMinutesAt_idx" ON "BndWaitingPeriod"("overFiveMinutesAt");
CREATE UNIQUE INDEX "BndWaitingPeriod_one_open_period" ON "BndWaitingPeriod"("orderId") WHERE "endObservedAt" IS NULL;
