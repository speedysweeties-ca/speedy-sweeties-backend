-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "privacyVerifiedEmail" TEXT,
ADD COLUMN     "privacyVerifiedEmailAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "privacyErasedAt" TIMESTAMP(3),
ADD COLUMN     "privacyRetainUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PrivacyChallenge" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT,
    "contactFingerprint" TEXT,
    "phoneHash" TEXT NOT NULL,
    "requesterHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "delivery" TEXT NOT NULL DEFAULT 'UNAVAILABLE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyDeletionRequest" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT,
    "activeSubject" TEXT,
    "challengeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "contactFingerprint" TEXT NOT NULL,
    "decision" JSONB,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "databaseErasedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PrivacyDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyAudit" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyExternalTask" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "evidence" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyExternalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyDeletedIdentity" (
    "phoneHash" TEXT NOT NULL,
    "keyFingerprint" TEXT NOT NULL,
    "reviewAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyDeletedIdentity_pkey" PRIMARY KEY ("phoneHash")
);

-- CreateIndex
CREATE INDEX "PrivacyChallenge_phoneHash_createdAt_idx" ON "PrivacyChallenge"("phoneHash", "createdAt");

-- CreateIndex
CREATE INDEX "PrivacyChallenge_requesterHash_createdAt_idx" ON "PrivacyChallenge"("requesterHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacyDeletionRequest_activeSubject_key" ON "PrivacyDeletionRequest"("activeSubject");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacyDeletionRequest_challengeId_key" ON "PrivacyDeletionRequest"("challengeId");

-- CreateIndex
CREATE INDEX "PrivacyDeletionRequest_status_createdAt_idx" ON "PrivacyDeletionRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PrivacyAudit_requestId_createdAt_idx" ON "PrivacyAudit"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacyExternalTask_requestId_system_key" ON "PrivacyExternalTask"("requestId", "system");

-- AddForeignKey
ALTER TABLE "PrivacyAudit" ADD CONSTRAINT "PrivacyAudit_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrivacyDeletionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyExternalTask" ADD CONSTRAINT "PrivacyExternalTask_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrivacyDeletionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Retained financial records are immutable to legacy clients and stale staff writes.
CREATE FUNCTION privacy_retained_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."privacyErasedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Retained privacy record is read only';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER privacy_retained_order_guard BEFORE UPDATE OR DELETE ON "Order"
FOR EACH ROW EXECUTE FUNCTION privacy_retained_order_guard();

CREATE FUNCTION privacy_retained_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM id FROM "Order" WHERE id = OLD."orderId" AND "privacyErasedAt" IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Retained privacy record is read only'; END IF;
    RETURN OLD;
  END IF;
  PERFORM id FROM "Order" WHERE id = NEW."orderId" AND "privacyErasedAt" IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Retained privacy record is read only'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER privacy_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON "DigitalReceipt"
FOR EACH ROW EXECUTE FUNCTION privacy_retained_child_guard();
CREATE TRIGGER privacy_item_guard BEFORE INSERT OR UPDATE OR DELETE ON "OrderItem"
FOR EACH ROW EXECUTE FUNCTION privacy_retained_child_guard();
CREATE TRIGGER privacy_help_guard BEFORE INSERT OR UPDATE ON "DeliveryHelpRequest"
FOR EACH ROW EXECUTE FUNCTION privacy_retained_child_guard();
