export type PrivacyPreview = {
  id: string; version: number; previewHash: string; orderCount: number;
  sourceOrderId: string; activeOrders: string[]; unlinkedOrderIds: string[]; conflictingLinkedOrderIds: string[];
  financialFields: string[]; externalSystems: string[]; removes: string; dueAt: string;
};
export function privacyDecision(preview: PrivacyPreview, input: {
  policy: string; reason: string; taxYearEnd: string; financialUntil: string; requestUntil: string; suppressionReview: string; confirmed: boolean;
}) {
  if (!input.confirmed || input.policy.trim().length < 8 || input.reason.trim().length < 12 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.taxYearEnd) ||
      preview.activeOrders.length || preview.unlinkedOrderIds.length || preview.conflictingLinkedOrderIds.length)
    throw new Error('Review the impact and complete an explicit retention decision first.');
  const date = (value: string) => {
    if (!value || !Number.isFinite(Date.parse(value)) || Date.parse(value) <= Date.now()) throw new Error('Every retention/review date must be explicitly chosen and in the future.');
    return new Date(value).toISOString();
  };
  return { version: preview.version, previewHash: preview.previewHash, decision: {
    policyReference: input.policy.trim(), justification: input.reason.trim(), taxYearEnd: input.taxYearEnd, financialRetainUntil: date(input.financialUntil),
    requestRetainUntil: date(input.requestUntil), suppressionReviewAt: date(input.suppressionReview),
    personalFields: [], financialFields: preview.financialFields, unlinkedRecordsReviewed: true, confirmed: true
  } };
}
