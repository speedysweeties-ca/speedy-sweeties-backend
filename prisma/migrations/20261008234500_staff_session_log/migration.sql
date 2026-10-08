CREATE TABLE "StaffSessionEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "staffName" TEXT,
    "role" "UserRole" NOT NULL,
    "client" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    CONSTRAINT "StaffSessionEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffSessionEvent_eventKey_key" ON "StaffSessionEvent"("eventKey");
CREATE INDEX "StaffSessionEvent_occurredAt_id_idx" ON "StaffSessionEvent"("occurredAt", "id");
CREATE INDEX "StaffSessionEvent_userId_occurredAt_idx" ON "StaffSessionEvent"("userId", "occurredAt");
CREATE INDEX "StaffSessionEvent_role_occurredAt_idx" ON "StaffSessionEvent"("role", "occurredAt");
