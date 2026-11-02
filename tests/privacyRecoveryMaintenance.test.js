process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrivacyRecoveryJournal } = require('../dist/services/privacyRecoveryJournal');
const { S3ProtectedDecisionStore } = require('../dist/services/privacyRecoveryS3');
const { prepareRecoverySuccessor, verifyRecoverySuccessor, authorizeRetiredHistoryRemoval } = require('../dist/services/privacyRecoveryMaintenance');
const { syntheticS3Journal } = require('./privacyRecoveryS3Fixture.cjs');
const key = 'synthetic-stable-successor-key-only';
const nextReviewAt = () => new Date(Date.now() + 86400000).toISOString();
const state = (id, status = 'COMPLETED') => ({ request: { id, status, dueAt: '2026-01-31T00:00:00.000Z',
  closedAt: status === 'HOLD' ? null : '2026-01-01T00:00:00.000Z', requestAuditReviewAt: '2028-01-01T00:00:00.000Z',
  databaseErasedAt: status === 'COMPLETED' ? '2026-01-01T00:00:00.000Z' : null },
  marker: status === 'COMPLETED' ? { reviewAt: '2028-01-01T00:00:00.000Z', phoneHash: 'synthetic-hash' } : null,
  decision: { financialRetainUntil: '2032-12-31T23:59:59.999Z' }, tasks: [] });
async function fixture() {
  const f = await syntheticS3Journal(key);
  for (const s of [state('completed'), state('held', 'HOLD'), state('cancelled', 'CANCELLED')]) {
    const intent = await f.journal.intent((await f.journal.ready()).head, 'SYNTHETIC', s); await f.journal.committed(intent);
  }
  const targetConfig = { ...f.activeConfig, mode: 'successor', prefix: 'verification/synthetic-successor/', scope: 'synthetic-successor', genesisHash: undefined };
  const target = new PrivacyRecoveryJournal(new S3ProtectedDecisionStore(targetConfig, f.transport), targetConfig.scope, key);
  const plan = { reviewedAt: new Date().toISOString(), cases: [...(await f.journal.ready()).cases.values()].map(s => ({
    requestId: s.request.id, expectedStateDigest: f.journal.evidenceDigest(s), action: 'retain',
    justification: 'Synthetic justified recovery protection', nextReviewAt: nextReviewAt()
  })) };
  return { ...f, target, targetConfig, plan };
}

test('successor coverage preserves original dates, financial decisions and justified holds before retirement permission', async () => {
  const f = await fixture(), original = (await f.journal.ready()).cases;
  const result = await prepareRecoverySuccessor(f.journal, f.target, f.plan, true);
  assert.equal(result.retainedCount, 3); assert.equal(result.removedCount, 0); assert.equal(result.trafficMayReopen, false);
  await assert.rejects(f.journal.ready(), /SCOPE_SEALED/);
  const after = await f.target.ready();
  for (const [id, before] of original) {
    const current = after.cases.get(id);
    assert.deepEqual(current.request, before.request); assert.deepEqual(current.decision, before.decision); assert.deepEqual(current.marker, before.marker);
    assert.ok(current.recoveryReview.justificationHash); assert.equal(current.recoveryReview.nextReviewAt, f.plan.cases.find(r => r.requestId === id).nextReviewAt);
  }
  const pin = { scope: f.target.scope, enrollmentHash: result.enrollmentHash };
  const permit = await authorizeRetiredHistoryRemoval(f.journal, f.target, pin, true);
  assert.equal(permit.reviewedRetiredRemovalAllowed, true); assert.equal(permit.activeHistoryRemovalAllowed, false);
  await assert.rejects(authorizeRetiredHistoryRemoval(f.journal, f.target, { ...pin, enrollmentHash: '0'.repeat(64) }, true), /COVERAGE_UNVERIFIED/);
  await assert.rejects(authorizeRetiredHistoryRemoval(f.journal, f.target, pin, false), /OFFLINE/);
  assert.equal(JSON.parse(f.transport.objects.get(f.targetConfig.prefix + '0000000000000001.json')).kind, 'CHECKPOINT');
});

test('interrupted checkpoint remains blocked; exact plan retries without duplicating or reopening the predecessor', async () => {
  const f = await fixture(); f.transport.failKind = 'CASE';
  await assert.rejects(prepareRecoverySuccessor(f.journal, f.target, f.plan, true), /WRITE_UNCERTAIN/);
  await assert.rejects(f.journal.ready(), /SCOPE_SEALED/); await assert.rejects(f.target.ready(), /UNFINISHED_COVERAGE/);
  await assert.rejects(verifyRecoverySuccessor(f.journal, f.target, { scope: f.target.scope, enrollmentHash: 'a'.repeat(64) }), /UNFINISHED_COVERAGE/);
  f.transport.failKind = null;
  const result = await prepareRecoverySuccessor(f.journal, f.target, f.plan, true);
  const count = f.transport.objects.size;
  assert.deepEqual(await prepareRecoverySuccessor(f.journal, f.target, f.plan, true), result);
  assert.equal(f.transport.objects.size, count);
  const active = new PrivacyRecoveryJournal(new S3ProtectedDecisionStore({ ...f.targetConfig, mode: 'active', genesisHash: result.enrollmentHash }, f.transport), f.target.scope, key);
  const updated = { ...(await active.ready()).cases.get('held'), request: { ...state('held', 'HOLD').request, status: 'CANCELLED' } };
  const intent = await active.intent((await active.ready()).head, 'SYNTHETIC', updated); await active.committed(intent);
  assert.equal((await active.ready()).cases.get('held').recoveryReview.nextReviewAt, f.plan.cases.find(r => r.requestId === 'held').nextReviewAt);
});

test('stale/missing reviews, unfinished operations, wrong key and removal of holds stop before sealing', async () => {
  const f = await fixture();
  const before = (await f.journal.ready()).head;
  await assert.rejects(prepareRecoverySuccessor(f.journal, f.target, { ...f.plan, cases: f.plan.cases.slice(1) }, true), /REVIEW_REQUIRED/);
  const stale = structuredClone(f.plan); stale.cases[0].expectedStateDigest = 'a'.repeat(64);
  await assert.rejects(prepareRecoverySuccessor(f.journal, f.target, stale, true), /STALE_OR_INCOMPLETE/);
  const removedHold = structuredClone(f.plan); removedHold.cases.find(r => r.requestId === 'held').action = 'remove';
  await assert.rejects(prepareRecoverySuccessor(f.journal, f.target, removedHold, true), /HOLD_MUST_REMAIN/);
  const noNeed = structuredClone(f.plan); noNeed.cases.find(r => r.requestId === 'completed').action = 'remove';
  await assert.rejects(prepareRecoverySuccessor(f.journal, f.target, noNeed, true), /REMOVAL_REVIEW_REQUIRED/);
  const wrong = new PrivacyRecoveryJournal(f.target.store, f.target.scope, 'synthetic-wrong-successor-key');
  await assert.rejects(prepareRecoverySuccessor(f.journal, wrong, f.plan, true), /KEY_MISMATCH/);
  assert.deepEqual((await f.journal.ready()).head, before);
  await f.journal.intent(before, 'UNCERTAIN', state('extra'));
  await assert.rejects(prepareRecoverySuccessor(f.journal, f.target, f.plan, true), /UNFINISHED_OPERATION/);
});

test('explicit no-need review can remove a closed case before 24 months; no age-based deletion or financial erasure', async () => {
  const f = await fixture();
  const row = f.plan.cases.find(r => r.requestId === 'completed');
  Object.assign(row, { action: 'remove', noJustifiedNeed: true, restorationRiskResolved: true, unresolvedCaseRiskResolved: true,
    financialEvidenceProtected: true, externalHoldsResolved: true });
  const result = await prepareRecoverySuccessor(f.journal, f.target, f.plan, true);
  assert.equal(result.removedCount, 1); assert.equal((await f.target.ready()).cases.has('completed'), false);
  assert.equal((await f.target.ready()).cases.get('held').request.status, 'HOLD');
  const serialized = JSON.stringify(await f.target.store.read());
  assert.ok(!serialized.includes('completed')); // Removed request ID is not copied into its successor.
  assert.equal((await f.journal.inspect()).cases.has('completed'), true); // No deletion before separately approved retirement.
});
