const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');

test('post-snapshot decisions survive actual serial synthetic PostgreSQL dump/restore', {
  skip: process.env.PRIVACY_SYNTHETIC_DATABASE !== 'yes'
}, async t => {
  assert.equal(process.env.NODE_ENV, 'test');
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/speedy_privacy_synthetic');
  const { prisma: db } = require('../dist/lib/prisma');
  const { PrivacyDeletionService, retainedFinancialFields, externalSystems, digest } = require('../dist/services/privacyDeletion.service');
  const { PrivacyRecoveryJournal } = require('../dist/services/privacyRecoveryJournal');
  const { reconcileSyntheticRestore } = require('../dist/services/privacyRecovery.service');
  const { assertPrivacyOrderAllowed } = require('../dist/services/privacyGuards.service');
  const { signCustomerLoyaltyToken } = require('../dist/utils/jwt');
  const { getCustomerLoyaltyByTokenController } = require('../dist/controllers/customer.controller');
  const { getPublicOrderTrackingController } = require('../dist/controllers/order.controller');
  const { dump, restore } = require('./privacyRecoverySnapshot.cjs');
  const key = 'synthetic-recovery-digest-not-jwt';
  const priorKey = process.env.PRIVACY_DIGEST_KEY;
  process.env.PRIVACY_DIGEST_KEY = key;
  // Same real PostgreSQL restore fixtures, now backed by the proposed adapter
  // with controlled S3 responses. This is not AWS cloud verification.
  const fixture = await require('./privacyRecoveryS3Fixture.cjs').syntheticS3Journal(key, db);
  let store = fixture.journal;
  const s3 = fixture.transport;
  let keyOf = fixture.keyOf;
  const sent = new Map();
  const delivery = { async start(m) { sent.set(m.id, m.code); return {}; }, async check() { throw Error('No phone delivery'); } };
  let service = new PrivacyDeletionService(db, key, delivery, () => true, 'Synthetic 30-day commitment', '12-31', store);
  const fixtures = { customers: new Set(), orders: new Set(), phoneHashes: new Set() };
  const year = new Date().getUTCFullYear();
  const decision = { policyReference: 'SYNTHETIC-RETENTION', justification: 'Synthetic financial evidence must remain readable.', taxYearEnd: `${year}-12-31`,
    financialRetainUntil: `${year + 6}-12-31T23:59:59.999Z`, personalFields: [], financialFields: [...retainedFinancialFields], unlinkedRecordsReviewed: true, confirmed: true };
  const seed = async n => {
    const phone = `51955501${String(n).padStart(2, '0')}`, email = `recovery-${n}@example.invalid`;
    const c = await db.customer.create({ data: { fullName: 'Synthetic Recovery', normalizedFullName: 'synthetic recovery', phone, normalizedPhone: phone,
      email, normalizedEmail: email, addressLine1: '1 Synthetic Street', city: 'Guelph', province: 'ON' } });
    const tracking = randomBytes(32).toString('hex');
    const o = await db.order.create({ data: { customerId: c.id, customerName: c.fullName, phone, email, addressLine1: c.addressLine1,
      city: c.city, province: c.province, paymentMethod: 'CASH', orderStatus: 'DELIVERED', orderSource: 'IOS_APP', itemsText: 'Synthetic private note',
      fcmToken: 'synthetic-push', trackingTokenHash: digest(tracking), trackingTokenExpiresAt: new Date(Date.now() + 86400000),
      items: { create: { name: 'Synthetic water bottle', quantity: 2, price: '3.50' } },
      digitalReceipt: { create: { receiptNumber: randomUUID(), itemTotal: '7.00', deliveryCharge: '12.00', taxOrFees: '0.00', grandTotal: '19.00',
        notes: 'Extra stops: 2\nExtra stop charge: $8.00\nDistance surcharge: $4.00\nSynthetic private receipt text' } },
      helpRequest: { create: { message: 'Synthetic help message' } } } });
    fixtures.customers.add(c.id); fixtures.orders.add(o.id); fixtures.phoneHashes.add(service.hash(`phone:${phone}`));
    return { c, o, tracking };
  };
  const submit = async f => {
    const challenge = await service.challenge({ trackingToken: f.tracking }, 'synthetic-requester');
    const accessToken = randomBytes(32).toString('hex');
    const { proof } = await service.verify(challenge.challengeId, sent.get(challenge.challengeId), accessToken);
    const input = { id: randomUUID(), token: randomBytes(32).toString('hex'), challengeId: challenge.challengeId, proof, accessToken };
    await service.submit(input); return input;
  };
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });
  const order = id => db.order.findUnique({ where: { id }, include: { items: true, digitalReceipt: true, helpRequest: true } });
  let cleanupSnapshot;
  try {
    assert.equal(await db.order.count(), 0); assert.equal(await db.customer.count(), 0);
    const a = await seed(1), b = await seed(2), c = await seed(3), unrelated = await seed(4);
    const extra = await db.order.create({ data: { customerId: a.c.id, customerName: a.c.fullName, phone: a.c.phone,
      email: a.c.email, addressLine1: a.c.addressLine1, city: a.c.city, province: a.c.province,
      itemsText: 'Synthetic second transaction', paymentMethod: 'CASH', orderStatus: 'DELIVERED' } });
    fixtures.orders.add(extra.id);
    const unrelatedBefore = await order(unrelated.o.id);
    const initial = await dump(db, fixtures); // T0 before verification/request creation.
    cleanupSnapshot = initial;
    const ia = await submit(a), ib = await submit(b), ic = await submit(c);
    const beforeFulfillment = await dump(db, fixtures); // T0 with SUBMITTED rows.
    const p = await service.impact(ia.id);
    await service.fulfill(ia.id, 'synthetic-admin', p.version, p.previewHash, decision);
    for (const system of externalSystems) await service.resolveExternal(ia.id, 'synthetic-admin', system, 'Synthetic external outcome reviewed.');
    await service.complete(ia.id, 'synthetic-admin');
    await service.cancel(ib.id, ib.token); await service.hold(ic.id, 'synthetic-admin');
    const holdPreview = await service.impact(ic.id);
    await assert.rejects(service.fulfill(ic.id, 'synthetic-admin', holdPreview.version, holdPreview.previewHash, decision), /REQUEST_ON_HOLD/);
    const original = await db.privacyDeletionRequest.findUnique({ where: { id: ia.id } });
    const originalMarker = await db.privacyDeletedIdentity.findFirst();
    await t.test('reviewed successor preserves complete restore coverage and dates without empty-baseline enrollment', async () => {
      const { S3ProtectedDecisionStore } = require('../dist/services/privacyRecoveryS3');
      const { prepareRecoverySuccessor, authorizeRetiredHistoryRemoval } = require('../dist/services/privacyRecoveryMaintenance');
      const source = store, state = await source.ready();
      const targetConfig = { ...fixture.activeConfig, prefix: fixture.activeConfig.prefix.replace(/[^/]+\/$/, 'successor/'),
        scope: 'synthetic-privacy-successor', mode: 'successor', genesisHash: undefined };
      const target = new PrivacyRecoveryJournal(new S3ProtectedDecisionStore(targetConfig, s3), targetConfig.scope, key);
      const plan = { reviewedAt: new Date().toISOString(), cases: [...state.cases.values()].map(s => ({
        requestId: s.request.id, expectedStateDigest: source.evidenceDigest(s), action: 'retain',
        justification: 'Synthetic restoration risk remains verified', nextReviewAt: new Date(Date.now() + 86400000).toISOString()
      })) };
      const coverage = await prepareRecoverySuccessor(source, target, plan, true);
      store = new PrivacyRecoveryJournal(new S3ProtectedDecisionStore({ ...targetConfig, mode: 'active', genesisHash: coverage.enrollmentHash }, s3), target.scope, key);
      assert.equal((await store.ready()).cases.size, 3);
      assert.equal((await authorizeRetiredHistoryRemoval(source, store, { scope: store.scope, enrollmentHash: coverage.enrollmentHash }, true)).reviewedRetiredRemovalAllowed, true);
      await assert.rejects(source.ready(), /SCOPE_SEALED/);
      keyOf = n => `${targetConfig.prefix}${String(n).padStart(16, '0')}.json`;
      service = new PrivacyDeletionService(db, key, delivery, () => true, 'Synthetic 30-day commitment', '12-31', store);
    });
    const storedText = JSON.stringify(await store.store.read());
    for (const privateValue of [a.c.phone, a.c.email, a.c.addressLine1, ia.token, ia.accessToken, a.tracking, 'Synthetic private receipt text'])
      assert.ok(!storedText.includes(privateValue), 'Checkpoint must not include raw private values');

    for (const [name, snapshot] of [['before-request', initial], ['before-fulfillment', beforeFulfillment]]) {
      await t.test(name, async () => {
        await restore(db, fixtures, snapshot);
        assert.equal(await db.privacyDeletedIdentity.count(), 0, 'Negative control: older DB lost marker');
        assert.ok(await db.customer.findUnique({ where: { id: a.c.id } }));
        await db.$transaction(tx => assertPrivacyOrderAllowed(tx, a.c.phone));
        const frozen = new Map(s3.objects);
        s3.objects.delete(keyOf(2));
        await assert.rejects(reconcileSyntheticRestore(service, process.env.DATABASE_URL, key), /INCOMPLETE/);
        s3.objects = new Map(frozen);
        const wrongJournal = new PrivacyRecoveryJournal(store.store, store.scope, 'synthetic-wrong-digest-key');
        const wrong = new PrivacyDeletionService(db, key, delivery, () => false, 'Synthetic', '12-31', wrongJournal);
        await assert.rejects(reconcileSyntheticRestore(wrong, process.env.DATABASE_URL, key), /HISTORY_INVALID/);
        assert.ok(await db.customer.findUnique({ where: { id: a.c.id } }), 'Failures never erase');
        await db.customer.update({ where: { id: a.c.id }, data: { normalizedEmail: 'other-synthetic@example.invalid' } });
        await assert.rejects(reconcileSyntheticRestore(service, process.env.DATABASE_URL, key), /OWNERSHIP_CHANGED/);
        await db.customer.update({ where: { id: a.c.id }, data: { normalizedEmail: a.c.email } });
        const item = (await order(a.o.id)).items[0];
        await db.orderItem.update({ where: { id: item.id }, data: { price: '9.00' } });
        await assert.rejects(reconcileSyntheticRestore(service, process.env.DATABASE_URL, key), /FINANCIAL_EVIDENCE_CHANGED/);
        await db.orderItem.update({ where: { id: item.id }, data: { price: '3.50' } });
        await db.order.delete({ where: { id: extra.id } });
        try {
          await assert.rejects(reconcileSyntheticRestore(service, process.env.DATABASE_URL, key), /FINANCIAL_SCOPE_INCOMPLETE/);
          assert.ok(await db.customer.findUnique({ where: { id: a.c.id } }), 'Missing evidence must not erase');
        } finally { await db.order.create({ data: extra }); }
        if (name === 'before-fulfillment') {
          // Regression: even an erroneously pre-imported completed request must
          // not let fulfill's normal retry shortcut skip restored-data erasure.
          await db.privacyDeletionRequest.update({ where: { id: ia.id }, data: { ...original, status: 'HOLD', version: original.version + 1 } });
          await assert.rejects(reconcileSyntheticRestore(service, process.env.DATABASE_URL, key), /NEWER_DATABASE_DECISION/);
          await db.privacyDeletionRequest.update({ where: { id: ia.id }, data: original });
          const later = await db.privacyExternalTask.create({ data: { requestId: ia.id, system: externalSystems[0],
            status: 'RETAINED_WITH_EXPIRY', evidence: 'Synthetic later external hold',
            retainUntil: new Date(`${year + 7}-12-31T23:59:59.999Z`), reviewedAt: new Date(Date.now() + 60000) } });
          try {
            await assert.rejects(reconcileSyntheticRestore(service, process.env.DATABASE_URL, key), /NEWER_EXTERNAL_DECISION/);
            assert.ok(await db.customer.findUnique({ where: { id: a.c.id } }), 'Newer external hold must not erase');
          } finally { await db.privacyExternalTask.delete({ where: { id: later.id } }); }
        }
        const result = await reconcileSyntheticRestore(service, process.env.DATABASE_URL, key);
        assert.equal(result.erased, 1); assert.equal(result.trafficMayReopen, false);
        const again = await reconcileSyntheticRestore(service, process.env.DATABASE_URL, key);
        assert.equal(again.erased, 0);
        assert.equal(await db.customer.findUnique({ where: { id: a.c.id } }), null);
        assert.ok(await db.customer.findUnique({ where: { id: b.c.id } }));
        assert.ok(await db.customer.findUnique({ where: { id: c.c.id } }));
        assert.equal((await service.status(ib.id, ib.token)).status, 'CANCELLED');
        assert.equal((await service.status(ic.id, ic.token)).status, 'HOLD');
        const closed = await db.privacyDeletionRequest.findUnique({ where: { id: ia.id } });
        for (const field of ['createdAt', 'dueAt', 'databaseErasedAt', 'completedAt', 'closedAt', 'requestAuditReviewAt'])
          assert.equal(closed[field].toISOString(), original[field].toISOString(), field);
        assert.equal(closed.status, 'COMPLETED');
        const marker = await db.privacyDeletedIdentity.findFirst();
        assert.equal(marker.reviewAt.toISOString(), originalMarker.reviewAt.toISOString());
        assert.equal(marker.createdAt.toISOString(), originalMarker.createdAt.toISOString());
        assert.equal(marker.keyFingerprint, createHash('sha256').update(key).digest('hex'));
        const erased = await order(a.o.id);
        assert.equal(erased.phone, ''); assert.equal(erased.email, ''); assert.equal(erased.customerId, null);
        assert.equal(erased.fcmToken, null); assert.equal(erased.trackingTokenHash, null); assert.equal(erased.helpRequest, null);
        assert.equal(erased.items[0].name, 'Synthetic water bottle'); assert.equal(erased.items[0].quantity, 2);
        assert.equal(erased.items[0].price.toString(), '3.5');
        assert.equal(erased.digitalReceipt.grandTotal.toString(), '19'); assert.equal(erased.digitalReceipt.notes, null);
        assert.deepEqual(erased.digitalReceipt.retainedChargeEvidence, { extraStops: 2, extraStopCharge: '8.00', distanceSurcharge: '4.00' });
        assert.equal(await db.privacyAccessCredential.count({ where: { customerId: a.c.id } }), 0);
        await assert.rejects(service.challenge({ accessToken: ia.accessToken }, 'synthetic'), /VERIFICATION_REQUIRED/);
        const loyalty = response(); await getCustomerLoyaltyByTokenController({ headers: { authorization: `Bearer ${signCustomerLoyaltyToken(a.c.id)}` } }, loyalty); assert.equal(loyalty.code, 401);
        const tracking = response(); await getPublicOrderTrackingController({ params: { id: a.o.id } }, tracking); assert.equal(tracking.code, 404);
        await assert.rejects(db.$transaction(tx => assertPrivacyOrderAllowed(tx, a.c.phone)), /IDENTITY_REVERIFICATION_REQUIRED/);
        await assert.rejects(db.order.update({ where: { id: a.o.id }, data: { phone: a.c.phone } }));
        await assert.rejects(db.orderItem.delete({ where: { id: erased.items[0].id } }));
        await assert.rejects(db.digitalReceipt.delete({ where: { orderId: a.o.id } }));
        assert.deepEqual(await order(unrelated.o.id), unrelatedBefore);
      });
    }
    await t.test('intent failure rolls DB back; lost post-commit acknowledgement blocks future decisions', async () => {
      s3.failKind = 'INTENT';
      await assert.rejects(service.cancel(ic.id, ic.token), /RECOVERY_WRITE_UNCERTAIN/);
      assert.equal((await service.status(ic.id, ic.token)).status, 'HOLD');
      s3.failKind = 'COMMIT';
      await assert.rejects(service.cancel(ic.id, ic.token), /RECOVERY_WRITE_UNCERTAIN/);
      assert.equal((await db.privacyDeletionRequest.findUnique({ where: { id: ic.id } })).status, 'CANCELLED');
      await assert.rejects(service.status(ic.id, ic.token), /UNFINISHED_OPERATION/);
      s3.failKind = null;
      await assert.rejects(store.ready(), /UNFINISHED_OPERATION/);
      await assert.rejects(reconcileSyntheticRestore(service, process.env.DATABASE_URL, key), /UNFINISHED_OPERATION/);
      await assert.rejects(service.cancel(ic.id, ic.token), /UNFINISHED_OPERATION/);
    });
  } finally {
    // Restore only our checked synthetic fixture baseline; leave no markers with
    // this suite's dedicated key for the later, independent lifecycle fixtures.
    if (cleanupSnapshot) await restore(db, fixtures, cleanupSnapshot);
    if (priorKey === undefined) delete process.env.PRIVACY_DIGEST_KEY; else process.env.PRIVACY_DIGEST_KEY = priorKey;
    await db.$disconnect();
  }
});
