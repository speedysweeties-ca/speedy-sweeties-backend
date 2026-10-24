const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');

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
  const delivery = {
    async start(msg) { sent.set(msg.id, msg); return msg.channel === 'PHONE' ? { reference: `VE-${msg.id}` } : {}; },
    async check(msg) { return msg.channel === 'PHONE' && msg.code === '654321' && msg.reference === `VE-${msg.reference.slice(3)}`; }
  };
  // Phone checks use a simpler deterministic mock below; no provider or live message is used.
  delivery.check = async msg => msg.channel === 'PHONE' && msg.code === '654321' && String(msg.reference).startsWith('VE-');
  const timeframe = 'within 30 days (synthetic test wording only)';
  const fiscalYearEnd = `${new Date().getUTCFullYear()}-12-31`;
  const financialRetainUntil = `${new Date().getUTCFullYear() + 6}-12-31T23:59:59.999Z`;
  const service = new PrivacyDeletionService(db, process.env.JWT_SECRET, delivery, () => true, timeframe, '12-31');
  const decision = () => ({ policyReference: 'SYNTHETIC-TEST-ONLY', justification: 'Synthetic fixture financial retention; not a business policy.', taxYearEnd: fiscalYearEnd,
    financialRetainUntil, requestRetainUntil: new Date(Date.now() + 172800000).toISOString(),
    suppressionReviewAt: new Date(Date.now() + 172800000).toISOString(), personalFields: [], financialFields: [...retainedFinancialFields], unlinkedRecordsReviewed: true, confirmed: true });
  const seed = async ({ email = true } = {}) => {
    const unique = randomBytes(6).toString('hex');
    const phone = '519' + String(parseInt(unique, 16)).slice(-7).padStart(7, '0');
    return db.customer.create({ data: { fullName: 'Synthetic Customer', normalizedFullName: 'synthetic customer', phone, normalizedPhone: phone,
      email: email ? `${unique}@example.invalid` : null, normalizedEmail: email ? `${unique}@example.invalid` : null,
      addressLine1: '1 Example Street', city: 'Guelph', province: 'ON' } });
  };
  const ordered = async (customer, status = 'DELIVERED', changes = {}) => {
    const trackingToken = randomBytes(32).toString('base64url');
    const order = await db.order.create({ data: {
      customerId: customer.id, customerName: customer.fullName, phone: customer.phone, email: customer.email || '',
      addressLine1: customer.addressLine1, city: customer.city, province: customer.province, unitNumber: '2', buzzCode: '123',
      itemsText: 'private text', additionalNotes: 'private instructions', fcmToken: 'synthetic-push',
      trackingTokenHash: createHash('sha256').update(trackingToken).digest('hex'), trackingTokenExpiresAt: new Date(Date.now() + 86400000),
      paymentMethod: 'CASH', orderSource: 'IOS_APP', orderStatus: status,
      items: { create: { name: 'Synthetic water', quantity: 2, price: '3.50' } },
      digitalReceipt: { create: { receiptNumber: randomUUID(), itemTotal: '7.00', deliveryCharge: '12.00', taxOrFees: '0.00', grandTotal: '19.00', notes: 'Extra stops: 2\nExtra stop charge: $8.00\nDistance surcharge: $4.00\nGate code 1234' } },
      helpRequest: { create: { message: 'private message' } }, ...changes
    } });
    return { order, trackingToken };
  };
  const verified = async (customer, bootstrap) => {
    const source = bootstrap || await ordered(customer);
    const challenge = await service.challenge(source.trackingToken
      ? { trackingToken: source.trackingToken }
      : { loyaltyToken: signCustomerLoyaltyToken(customer.id) }, randomUUID());
    const accessToken = randomBytes(32).toString('hex');
    const code = challenge.channel === 'PHONE' ? '654321' : sent.get(challenge.challengeId).code;
    const { proof } = await service.verify(challenge.challengeId, code, accessToken);
    return { id: randomUUID(), token: randomBytes(32).toString('hex'), challengeId: challenge.challengeId, proof, accessToken, source };
  };
  const freshProof = async input => {
    const challenge = await service.challenge({ accessToken: input.accessToken }, randomUUID());
    const code = challenge.channel === 'PHONE' ? '654321' : sent.get(challenge.challengeId).code;
    const { proof } = await service.verify(challenge.challengeId, code, input.accessToken);
    return { ...input, id: randomUUID(), token: randomBytes(32).toString('hex'), challengeId: challenge.challengeId, proof };
  };
  const fulfill = async input => { const p = await service.impact(input.id); return service.fulfill(input.id, 'synthetic-admin', p.version, p.previewHash, decision()); };
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });

  try {
    await t.test('customer/order credential is required and phone-only verification uses the managed provider path', async () => {
      await assert.rejects(service.challenge({}, randomUUID()), /INVALID_REQUEST/);
      await assert.rejects(service.challenge({ trackingToken: 'not-a-token' }, randomUUID()), /VERIFICATION_REQUIRED/);
      const c = await seed(), source = await ordered(c);
      const challenge = await service.challenge({ trackingToken: source.trackingToken }, randomUUID());
      assert.equal(challenge.channel, 'EMAIL'); assert.match(challenge.maskedDestination, /@example\.invalid$/);
      assert.equal(challenge.completionTimeframe, timeframe);
      const phoneOnly = await seed({ email: false }); await ordered(phoneOnly);
      const phoneChallenge = await service.challenge({ loyaltyToken: signCustomerLoyaltyToken(phoneOnly.id) }, randomUUID());
      assert.equal(phoneChallenge.channel, 'PHONE'); assert.match(phoneChallenge.maskedDestination, /\d{4}$/);
      const accessToken = randomBytes(32).toString('hex');
      await assert.rejects(service.verify(phoneChallenge.challengeId, '000000', accessToken), /INVALID_OR_EXPIRED_CODE/);
      await service.verify(phoneChallenge.challengeId, '654321', accessToken);
    });

    await t.test('shared or reassigned contacts fail closed before a challenge is sent', async () => {
      const c = await seed({ email: false }); const source = await ordered(c);
      await db.customer.create({ data: { fullName: 'Other', normalizedFullName: 'other', phone: c.phone, normalizedPhone: c.phone,
        addressLine1: '2 Example Street', city: 'Guelph', province: 'ON' } });
      await assert.rejects(service.challenge({ trackingToken: source.trackingToken }, randomUUID()), /MANUAL_REVIEW_REQUIRED/);
    });

    await t.test('a resent code supersedes older challenges for the same customer', async () => {
      const c = await seed(), source = await ordered(c);
      const older = await service.challenge({ trackingToken: source.trackingToken }, randomUUID());
      const newer = await service.challenge({ trackingToken: source.trackingToken }, randomUUID());
      const accessToken = randomBytes(32).toString('hex');
      await assert.rejects(service.verify(older.challengeId, sent.get(older.challengeId).code, accessToken), /INVALID_OR_EXPIRED_CODE/);
      await service.verify(newer.challengeId, sent.get(newer.challengeId).code, accessToken);
    });

    await t.test('attempt limits persist and expiry/contact changes invalidate proof', async () => {
      const c = await seed(), source = await ordered(c), challenge = await service.challenge({ trackingToken: source.trackingToken }, randomUUID());
      const accessToken = randomBytes(32).toString('hex');
      for (let n = 0; n < 5; n++) await assert.rejects(service.verify(challenge.challengeId, '00000000', accessToken));
      await assert.rejects(service.verify(challenge.challengeId, sent.get(challenge.challengeId).code, accessToken));
      assert.equal((await db.privacyChallenge.findUnique({ where: { id: challenge.challengeId } })).attempts, 5);
      const c2 = await seed(), input = await verified(c2);
      await db.customer.update({ where: { id: c2.id }, data: { normalizedEmail: 'changed@example.invalid' } });
      await assert.rejects(service.submit(input), /VERIFICATION_REQUIRED/);
      const c3 = await seed(), source3 = await ordered(c3), expired = await service.challenge({ trackingToken: source3.trackingToken }, randomUUID());
      await db.privacyChallenge.update({ where: { id: expired.challengeId }, data: { expiresAt: new Date(0) } });
      await assert.rejects(service.verify(expired.challengeId, sent.get(expired.challengeId).code, randomBytes(32).toString('hex')));
    });

    await t.test('durable per-contact limit cannot be bypassed across service instances', async () => {
      const c = await seed(), source = await ordered(c);
      for (let n = 0; n < 5; n++) await service.challenge({ trackingToken: source.trackingToken }, randomUUID());
      const other = new PrivacyDeletionService(db, process.env.JWT_SECRET, delivery, () => false, timeframe, '12-31');
      await assert.rejects(other.challenge({ trackingToken: source.trackingToken }, randomUUID()), /TRY_LATER/);
    });

    await t.test('request replay is idempotent and a fresh access challenge recovers a lost status credential', async () => {
      const c = await seed(), input = await verified(c);
      const first = await service.submit(input); await service.submit(input);
      assert.equal(first.completionTimeframe, timeframe);
      assert.ok(Date.parse(first.dueAt) >= Date.now() + 29 * 86400000);
      await db.privacyChallenge.update({ where: { id: input.challengeId }, data: { expiresAt: new Date(0) } });
      await service.submit(input);
      assert.equal(await db.privacyAudit.count({ where: { requestId: input.id, event: 'SUBMITTED' } }), 1);
      await assert.rejects(service.status(input.id, signCustomerLoyaltyToken(c.id)), /REQUEST_UNAVAILABLE/);
      const recovered = await freshProof(input), result = await service.submit(recovered);
      assert.equal(result.id, input.id);
      await assert.rejects(service.status(input.id, input.token), /REQUEST_UNAVAILABLE/);
      assert.equal((await service.status(input.id, recovered.token)).status, 'SUBMITTED');
      assert.equal(await db.privacyAudit.count({ where: { requestId: input.id, event: 'STATUS_CREDENTIAL_RECOVERED' } }), 1);
      await service.cancel(input.id, recovered.token); await service.cancel(input.id, recovered.token);
      assert.ok(await db.customer.findUnique({ where: { id: c.id } }));
    });

    await t.test('active deliveries and missing retention decisions stop fulfillment, not submission', async () => {
      const c = await seed(), source = await ordered(c, 'PLACED'), input = await verified(c, source); await service.submit(input);
      const p = await service.impact(input.id);
      await assert.rejects(service.fulfill(input.id, 'admin', p.version, p.previewHash, {}), /VALIDATED_RETENTION/);
      await assert.rejects(fulfill(input), /ACTIVE_ORDERS_HOLD/);
      const disabled = new PrivacyDeletionService(db, process.env.JWT_SECRET, delivery, () => false, timeframe, '12-31');
      await assert.rejects(disabled.fulfill(input.id, 'admin', p.version, p.previewHash, decision()), /FULFILLMENT_DISABLED/);
    });

    await t.test('stale, detached and identity-conflicting historical records require review', async () => {
      const c = await seed(), source = await ordered(c), input = await verified(c, source); await service.submit(input);
      const p = await service.impact(input.id);
      await db.order.update({ where: { id: source.order.id }, data: { additionalNotes: 'changed' } });
      await assert.rejects(service.fulfill(input.id, 'admin', p.version, p.previewHash, decision()), /STALE_PREVIEW/);
      await db.order.update({ where: { id: source.order.id }, data: { customerId: null } });
      await assert.rejects(fulfill(input), /SOURCE_ORDER_UNAVAILABLE/);

      const c2 = await seed(), source2 = await ordered(c2), input2 = await verified(c2, source2); await service.submit(input2);
      await ordered(c2, 'DELIVERED', { customerName: 'Different Person' });
      const preview = await service.impact(input2.id);
      assert.equal(preview.conflictingLinkedOrderIds.length, 1);
      await assert.rejects(service.fulfill(input2.id, 'admin', preview.version, preview.previewHash, decision()), /HISTORICAL_SCOPE_REVIEW_REQUIRED/);
    });

    await t.test('atomic rollback then fulfillment retains financial totals and revokes customer access', async () => {
      const c = await seed(), source = await ordered(c), input = await verified(c, source); await service.submit(input);
      const receiptCreatedAt = (await db.digitalReceipt.findUnique({ where: { orderId: source.order.id } })).createdAt;
      await db.$executeRawUnsafe('CREATE TABLE "SyntheticDeletionHold" ("customerId" TEXT REFERENCES "Customer"(id) ON DELETE RESTRICT)');
      await db.$executeRaw`INSERT INTO "SyntheticDeletionHold" VALUES (${c.id})`;
      await assert.rejects(fulfill(input));
      assert.equal((await db.order.findUnique({ where: { id: source.order.id } })).phone, c.phone);
      await db.$executeRaw`DELETE FROM "SyntheticDeletionHold" WHERE "customerId" = ${c.id}`;
      await db.$executeRawUnsafe('DROP TABLE "SyntheticDeletionHold"');
      const result = await fulfill(input); assert.equal(result.status, 'FULFILLING');
      assert.equal(await db.customer.findUnique({ where: { id: c.id } }), null);
      assert.equal(await db.privacyAccessCredential.count({ where: { customerId: c.id } }), 0);
      const erased = await db.order.findUnique({ where: { id: source.order.id }, include: { digitalReceipt: true, items: true, helpRequest: true } });
      assert.equal(erased.phone, ''); assert.equal(erased.addressLine1, ''); assert.equal(erased.customerId, null);
      assert.equal(erased.trackingTokenHash, null); assert.equal(erased.fcmToken, null); assert.equal(erased.helpRequest, null);
      assert.equal(erased.digitalReceipt.grandTotal.toFixed(2), '19.00'); assert.equal(erased.digitalReceipt.notes, null);
      assert.equal(erased.digitalReceipt.createdAt.toISOString(), receiptCreatedAt.toISOString());
      assert.deepEqual(erased.digitalReceipt.retainedChargeEvidence, { extraStops: 2, extraStopCharge: '8.00', distanceSurcharge: '4.00' });
      assert.equal(erased.items[0].name, 'Synthetic water'); assert.equal(erased.items[0].quantity, 2); assert.equal(erased.items[0].price.toFixed(2), '3.50');
      await assert.rejects(db.order.update({ where: { id: source.order.id }, data: { phone: c.phone, customerId: c.id } }));
      await assert.rejects(db.order.delete({ where: { id: source.order.id } }));
      await assert.rejects(db.digitalReceipt.update({ where: { orderId: source.order.id }, data: { notes: 'stale write' } }));
      await assert.rejects(db.orderItem.delete({ where: { id: erased.items[0].id } }));
      await assert.rejects(db.$transaction(tx => assertPrivacyOrderAllowed(tx, c.phone)), /IDENTITY_REVERIFICATION_REQUIRED/);
      const tracking = response(); await getPublicOrderTrackingController({ params: { id: source.order.id } }, tracking); assert.equal(tracking.code, 404);
      const loyalty = response(); await getCustomerLoyaltyByTokenController({ headers: { authorization: `Bearer ${signCustomerLoyaltyToken(c.id)}` } }, loyalty); assert.equal(loyalty.code, 401);
      await assert.rejects(service.cancel(input.id, input.token), /FULFILLMENT_ALREADY_STARTED/);
      await assert.rejects(service.complete(input.id, 'admin'), /EXTERNAL_WORK_INCOMPLETE/);
      await service.fulfill(input.id, 'admin', 0, 'old-preview', decision());
      for (const system of externalSystems) {
        await service.resolveExternal(input.id, 'admin', system, 'Synthetic external-system adapter confirmed no remaining copies');
        await service.resolveExternal(input.id, 'admin', system, 'Synthetic external-system adapter confirmed no remaining copies');
        assert.equal(await db.privacyAudit.count({ where: { requestId: input.id, event: `EXTERNAL_RESOLVED:${system}` } }), 1);
      }
      await service.complete(input.id, 'admin'); await service.complete(input.id, 'admin');
      const completed = await service.status(input.id, input.token);
      assert.equal(completed.status, 'COMPLETED'); assert.equal(completed.completionTimeframe, timeframe);
    });

    await t.test('unaffected customer ordering guard, loyalty, receipt and tracking still work', async () => {
      const c = await seed(), source = await ordered(c);
      await db.$transaction(tx => assertPrivacyOrderAllowed(tx, c.phone));
      const loyalty = response(); await getCustomerLoyaltyByTokenController({ headers: { authorization: `Bearer ${signCustomerLoyaltyToken(c.id)}` } }, loyalty); assert.equal(loyalty.code, 200);
      const tracking = response(); await getPublicOrderTrackingController({ params: { id: source.order.id } }, tracking); assert.equal(tracking.code, 200);
      assert.equal((await db.digitalReceipt.findUnique({ where: { orderId: source.order.id } })).grandTotal.toFixed(2), '19.00');
    });

    await t.test('unplanned suppression-key rotation fails closed instead of restoring deleted identities', async () => {
      const previous = process.env.PRIVACY_DIGEST_KEY;
      process.env.PRIVACY_DIGEST_KEY = 'synthetic-rotated-key-not-approved';
      try { await assert.rejects(db.$transaction(tx => assertPrivacyOrderAllowed(tx, '5195550123')), /PRIVACY_KEY_MIGRATION_REQUIRED/); }
      finally { if (previous === undefined) delete process.env.PRIVACY_DIGEST_KEY; else process.env.PRIVACY_DIGEST_KEY = previous; }
    });
  } finally { await db.$disconnect(); }
});
