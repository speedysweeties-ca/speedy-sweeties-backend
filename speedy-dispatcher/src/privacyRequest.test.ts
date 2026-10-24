import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privacyDecision, type PrivacyPreview } from './privacyRequest.ts';
const preview: PrivacyPreview = { id: 'synthetic', version: 2, previewHash: 'snapshot', orderCount: 1,
  sourceOrderId: 'source-order', activeOrders: [], unlinkedOrderIds: [], conflictingLinkedOrderIds: [],
  financialFields: ['grandTotal'], externalSystems: [], removes: '', dueAt: '2098-12-01T00:00:00.000Z' };
test('retention has no defaults and requires confirmation, dates and hold resolution', () => {
  const input = { policy: 'SYNTHETIC-POLICY', reason: 'Synthetic test only, not real retention', taxYearEnd: '2092-12-31', financialUntil: '2099-01-01', requestUntil: '2099-01-02', suppressionReview: '2099-01-03', confirmed: true };
  assert.throws(() => privacyDecision(preview, { ...input, financialUntil: '' }));
  assert.throws(() => privacyDecision(preview, { ...input, taxYearEnd: '' }));
  assert.throws(() => privacyDecision(preview, { ...input, confirmed: false }));
  assert.throws(() => privacyDecision({ ...preview, activeOrders: ['open'] }, input));
  assert.throws(() => privacyDecision({ ...preview, unlinkedOrderIds: ['unreviewed'] }, input));
  assert.throws(() => privacyDecision({ ...preview, conflictingLinkedOrderIds: ['different-identity'] }, input));
  const result = privacyDecision(preview, input);
  assert.deepEqual(result.decision.personalFields, []); assert.equal(result.decision.taxYearEnd, '2092-12-31'); assert.equal(result.version, 2); assert.equal(result.previewHash, 'snapshot');
});
