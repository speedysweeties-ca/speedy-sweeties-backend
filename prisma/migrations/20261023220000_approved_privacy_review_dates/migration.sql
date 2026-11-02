-- Owner-approved operational review dates. These columns do not authorize
-- automatic deletion or minimum retention through the review date.
ALTER TABLE "PrivacyDeletionRequest"
ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "requestAuditReviewAt" TIMESTAMP(3);

CREATE INDEX "PrivacyDeletionRequest_requestAuditReviewAt_idx"
ON "PrivacyDeletionRequest"("requestAuditReviewAt");
