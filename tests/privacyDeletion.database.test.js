const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');

test('privacy lifecycle on isolated synthetic PostgreSQL', { skip: process.env.PRIVACY_SYNTHETIC_DATABASE !== 'yes' }, async t => {
  assert.equal(process.env.NODE_ENV, 'test');
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/speedy_privacy_synthetic');
  const { prisma: db } = require('../dist/lib/prisma');
  const { PrivacyDeletionService, retainedFinancialFields, externalSystems } = require('../dist/services/privacyDeletion.service');
  const { assertPrivacyOrderAllowed } = require('../dist/services/privacyGuards.service');
  const { signCustomerLoyaltyToken } = require('../dist/utils/jwt');
  const { getCustomerLoyaltyByTokenController } = require('../dist/controllers/customer.controller');
  const { getPublicOrderTrackingController } = require('../dist/controllers/order.controller');
  const sent = new Map();
  const service = new PrivacyDeletionService(db, process.env.JWT_SECRET, async msg => { sent.set(msg.id, msg); }, () => true);
  const decision = () => ({ policyReference: 'SYNTHETIC-TEST-ONLY', justification: 'Synthetic fixture financial retention; not a business policy.',
    financialRetainUntil: new Date(Date.now() + 86400000).toISOString(), requestRetainUntil: new Date(Date.now() + 172800000).toISOString(),
    suppressionReviewAt: new Date(Date.now() + 172800000).toISOString(), personalFields: [], financialFields: [...retainedFinancialFields], unlinkedRecordsReviewed: true, confirmed: true });
  const seed = async () => {
    const unique = randomBytes(6).toString('hex');
    const phone = '519' + String(parseInt(unique, 16)).slice(-7);
    return db.customer.create({ data: { fullName: 'Synthetic Customer', normalizedFullName: 'synthetic customer', phone, normalizedPhone: phone,
      email: `${unique}@example.invalid`, normalizedEmail: `${unique}@example.invalid`, privacyVerifiedEmail: `${unique}@example.invalid`, privacyVerifiedEmailAt: new Date(),
      addressLine1: '1 Example Street', city: 'Guelph', province: 'ON' } });
  };
  const verified = async customer => {
    const c = await service.challenge(customer.phone, randomUUID());
    assert.equal(sent.get(c.challengeId).to, customer.email);
    const { proof } = await service.verify(c.challengeId, sent.get(c.challengeId).code);
    return { id: randomUUID(), token: randomBytes(32).toString('hex'), challengeId: c.challengeId, proof };
  };
  const ordered = async (customer, status = 'DELIVERED') => db.order.create({ data: {
    customerId: customer.id, customerName: customer.fullName, phone: customer.phone, email: customer.email,
    addressLine1: customer.addressLine1, city: customer.city, province: customer.province, unitNumber: '2', buzzCode: '123',
    itemsText: 'private text', additionalNotes: 'private instructions', fcmToken: 'synthetic-push',
    trackingTokenHash: randomBytes(32).toString('hex'), trackingTokenExpiresAt: new Date(Date.now() + 86400000),
    paymentMethod: 'CASH', orderSource: 'IOS_APP', orderStatus: status,
    items: { create: { name: 'Synthetic water', quantity: 2, price: '3.50' } },
    digitalReceipt: { create: { receiptNumber: randomUUID(), itemTotal: '7.00', deliveryCharge: '12.00', taxOrFees: '0.00', grandTotal: '19.00', notes: 'private note' } },
    helpRequest: { create: { message: 'private message' } }
  } });
  const fulfill = async input => { const p = await service.impact(input.id); return service.fulfill(input.id, 'synthetic-admin', p.version, p.previewHash, decision()); };
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });
  try {
    await t.test('no enumeration, no newly supplied email, ambiguous/unverified contact cannot prove ownership', async () => {
      const c = await seed(); await db.customer.update({ where: { id: c.id }, data: { privacyVerifiedEmailAt: null } });
      const challenge = await service.challenge(c.phone, randomUUID());
      assert.equal(sent.has(challenge.challengeId), false);
      await assert.rejects(service.verify(challenge.challengeId, '12345678'), /INVALID_OR_EXPIRED_CODE/);
      const missing = await service.challenge('5195550000', randomUUID());
      assert.equal(challenge.message, missing.message);
      await db.customer.create({ data: { fullName: 'Duplicate', normalizedFullName: 'duplicate', phone: c.phone, normalizedPhone: c.phone, addressLine1: '', city: '', province: '' } });
      const ambiguous = await service.challenge(c.phone, randomUUID());
      assert.equal(sent.has(ambiguous.challengeId), false);
    });
    await t.test('attempt limits persist and expiry/contact changes invalidate proof', async () => {
      const c = await seed(), challenge = await service.challenge(c.phone, randomUUID());
      for (let n = 0; n < 5; n++) await assert.rejects(service.verify(challenge.challengeId, '00000000'));
      await assert.rejects(service.verify(challenge.challengeId, sent.get(challenge.challengeId).code));
      assert.equal((await db.privacyChallenge.findUnique({ where: { id: challenge.challengeId } })).attempts, 5);
      const input = await verified(c);
      await db.customer.update({ where: { id: c.id }, data: { normalizedEmail: 'changed@example.invalid' } });
      await assert.rejects(service.submit(input), /VERIFICATION_REQUIRED/);
      const c2 = await seed(), expired = await service.challenge(c2.phone, randomUUID());
      await db.privacyChallenge.update({ where: { id: expired.challengeId }, data: { expiresAt: new Date(0) } });
      await assert.rejects(service.verify(expired.challengeId, sent.get(expired.challengeId).code));
    });
    await t.test('durable per-contact limit cannot be bypassed across service instances', async () => {
      const c = await seed(); for (let n = 0; n < 5; n++) await service.challenge(c.phone, randomUUID());
      const other = new PrivacyDeletionService(db, process.env.JWT_SECRET, async () => {});
      await assert.rejects(other.challenge(c.phone, randomUUID()), /TRY_LATER/);
    });
    await t.test('a contact becoming shared after challenge invalidates verification and submission', async () => {
      const c = await seed(), challenge = await service.challenge(c.phone, randomUUID());
      const duplicate = await seed();
      await db.customer.update({ where: { id: duplicate.id }, data: { normalizedEmail: c.normalizedEmail } });
      await assert.rejects(service.verify(challenge.challengeId, sent.get(challenge.challengeId).code), /INVALID_OR_EXPIRED_CODE/);
      const c2 = await seed(), input = await verified(c2), duplicate2 = await seed();
      await db.customer.update({ where: { id: duplicate2.id }, data: { normalizedPhone: c2.normalizedPhone } });
      await assert.rejects(service.submit(input), /VERIFICATION_REQUIRED/);
    });
    await t.test('request replay is idempotent, loyalty token is not status authority, cancellation preserves account', async () => {
      const c = await seed(), input = await verified(c);
      await service.submit(input); await service.submit(input);
      await db.privacyChallenge.update({ where: { id: input.challengeId }, data: { expiresAt: new Date(0) } });
      await service.submit(input); // Accepted request survives proof expiry after a lost response.
      assert.equal(await db.privacyAudit.count({ where: { requestId: input.id, event: 'SUBMITTED' } }), 1);
      await assert.rejects(service.status(input.id, signCustomerLoyaltyToken(c.id)), /REQUEST_UNAVAILABLE/);
      await assert.rejects(service.submit({ ...input, id: randomUUID() }), /VERIFICATION_REQUIRED/);
      await assert.rejects(service.cancel(input.id, randomBytes(32).toString('hex')), /REQUEST_UNAVAILABLE/);
      await service.cancel(input.id, input.token); await service.cancel(input.id, input.token);
      assert.ok(await db.customer.findUnique({ where: { id: c.id } }));
      assert.equal((await service.status(input.id, input.token)).status, 'CANCELLED');
      await assert.rejects(fulfill(input), /STALE_REQUEST/);
    });
    await t.test('active deliveries and missing retention decisions stop fulfillment, not submission', async () => {
      const c = await seed(); await ordered(c, 'PLACED'); const input = await verified(c); await service.submit(input);
      const p = await service.impact(input.id);
      await assert.rejects(service.fulfill(input.id, 'admin', p.version, p.previewHash, {}), /VALIDATED_RETENTION/);
      await assert.rejects(fulfill(input), /ACTIVE_ORDERS_HOLD/);
      const disabled = new PrivacyDeletionService(db, process.env.JWT_SECRET, async () => {});
      await assert.rejects(disabled.fulfill(input.id, 'admin', p.version, p.previewHash, decision()), /FULFILLMENT_DISABLED/);
    });
    await t.test('stale preview and detached phone-matching records require review', async () => {
      const c = await seed(), o = await ordered(c), input = await verified(c); await service.submit(input);
      const p = await service.impact(input.id);
      await db.order.update({ where: { id: o.id }, data: { additionalNotes: 'changed' } });
      await assert.rejects(service.fulfill(input.id, 'admin', p.version, p.previewHash, decision()), /STALE_PREVIEW/);
      await db.order.update({ where: { id: o.id }, data: { customerId: null } });
      await assert.rejects(fulfill(input), /UNLINKED_RECORDS_REQUIRE_REVIEW/);
    });
    await t.test('atomic rollback on partial database failure, then retry with exact financial totals', async () => {
      const c = await seed(), o = await ordered(c), input = await verified(c); await service.submit(input);
      // Use a real DB constraint to inject a failure late in the transaction.
      await db.$executeRawUnsafe('CREATE TABLE "SyntheticDeletionHold" ("customerId" TEXT REFERENCES "Customer"(id) ON DELETE RESTRICT)');
      await db.$executeRaw`INSERT INTO "SyntheticDeletionHold" VALUES (${c.id})`;
      await assert.rejects(fulfill(input));
      assert.equal((await db.order.findUnique({ where: { id: o.id } })).phone, c.phone);
      assert.equal((await service.status(input.id, input.token)).status, 'SUBMITTED');
      await db.$executeRaw`DELETE FROM "SyntheticDeletionHold" WHERE "customerId" = ${c.id}`;
      await db.$executeRawUnsafe('DROP TABLE "SyntheticDeletionHold"');
      const result = await fulfill(input); assert.equal(result.status, 'FULFILLING');
      assert.equal(await db.customer.findUnique({ where: { id: c.id } }), null);
      const erased = await db.order.findUnique({ where: { id: o.id }, include: { digitalReceipt: true, items: true, helpRequest: true } });
      assert.equal(erased.phone, ''); assert.equal(erased.addressLine1, ''); assert.equal(erased.customerId, null);
      assert.equal(erased.trackingTokenHash, null); assert.equal(erased.fcmToken, null); assert.equal(erased.helpRequest, null);
      assert.equal(erased.digitalReceipt.grandTotal.toFixed(2), '19.00'); assert.equal(erased.digitalReceipt.notes, null);
      assert.equal(erased.items[0].quantity, 2); assert.equal(erased.items[0].price.toFixed(2), '3.50');
      await assert.rejects(db.order.update({ where: { id: o.id }, data: { phone: c.phone, customerId: c.id } }));
      await assert.rejects(db.order.delete({ where: { id: o.id } }));
      await assert.rejects(db.digitalReceipt.update({ where: { orderId: o.id }, data: { notes: 'stale write' } }));
      await assert.rejects(db.digitalReceipt.delete({ where: { orderId: o.id } }));
      await assert.rejects(db.orderItem.delete({ where: { id: erased.items[0].id } }));
      await assert.rejects(db.$transaction(tx => assertPrivacyOrderAllowed(tx, c.phone)), /IDENTITY_REVERIFICATION_REQUIRED/);
      const tracking = response(); await getPublicOrderTrackingController({ params: { id: o.id } }, tracking); assert.equal(tracking.code, 404);
      const loyalty = response(); await getCustomerLoyaltyByTokenController({ headers: { authorization: `Bearer ${signCustomerLoyaltyToken(c.id)}` } }, loyalty); assert.equal(loyalty.code, 401);
      await assert.rejects(service.cancel(input.id, input.token), /FULFILLMENT_ALREADY_STARTED/);
      await assert.rejects(service.complete(input.id, 'admin'), /EXTERNAL_WORK_INCOMPLETE/);
      // Lost fulfillment response: a repeated command returns status without running deletion twice.
      await service.fulfill(input.id, 'admin', 0, 'old-preview', decision());
      for (const system of externalSystems) {
        await service.resolveExternal(input.id, 'admin', system, 'Synthetic external-system adapter confirmed no remaining copies');
        await service.resolveExternal(input.id, 'admin', system, 'Synthetic external-system adapter confirmed no remaining copies');
        assert.equal(await db.privacyAudit.count({ where: { requestId: input.id, event: `EXTERNAL_RESOLVED:${system}` } }), 1);
        await assert.rejects(service.resolveExternal(input.id, 'admin', system, 'Different evidence must not silently replace the recorded result'), /EVIDENCE_ALREADY_RECORDED/);
      }
      await service.complete(input.id, 'admin'); await service.complete(input.id, 'admin');
      assert.equal((await service.status(input.id, input.token)).status, 'COMPLETED');
      assert.equal(await db.privacyAudit.count({ where: { requestId: input.id, event: 'DATABASE_ERASED_EXTERNAL_PENDING' } }), 1);
    });
    await t.test('cancellation and fulfillment serialize: exactly one wins', async () => {
      const c = await seed(); await ordered(c); const input = await verified(c); await service.submit(input);
      const p = await service.impact(input.id);
      const results = await Promise.allSettled([service.cancel(input.id, input.token), service.fulfill(input.id, 'admin', p.version, p.previewHash, decision())]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const status = await service.status(input.id, input.token);
      assert.ok(['CANCELLED', 'FULFILLING'].includes(status.status));
      assert.equal(!!await db.customer.findUnique({ where: { id: c.id } }), status.status === 'CANCELLED');
    });
    await t.test('unaffected customer ordering guard, loyalty, receipt and tracking still work', async () => {
      const c = await seed(), o = await ordered(c);
      await db.$transaction(tx => assertPrivacyOrderAllowed(tx, c.phone));
      const loyalty = response(); await getCustomerLoyaltyByTokenController({ headers: { authorization: `Bearer ${signCustomerLoyaltyToken(c.id)}` } }, loyalty); assert.equal(loyalty.code, 200);
      const tracking = response(); await getPublicOrderTrackingController({ params: { id: o.id } }, tracking); assert.equal(tracking.code, 200);
      assert.equal((await db.digitalReceipt.findUnique({ where: { orderId: o.id } })).grandTotal.toFixed(2), '19.00');
    });
    await t.test('unplanned suppression-key rotation fails closed instead of restoring deleted identities', async () => {
      const previous = process.env.PRIVACY_DIGEST_KEY;
      process.env.PRIVACY_DIGEST_KEY = 'synthetic-rotated-key-not-approved';
      try { await assert.rejects(db.$transaction(tx => assertPrivacyOrderAllowed(tx, '5195550123')), /PRIVACY_KEY_MIGRATION_REQUIRED/); }
      finally { if (previous === undefined) delete process.env.PRIVACY_DIGEST_KEY; else process.env.PRIVACY_DIGEST_KEY = previous; }
    });
  } finally { await db.$disconnect(); }
});
