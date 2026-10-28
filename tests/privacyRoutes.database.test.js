const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { randomBytes, randomUUID, createHash } = require('node:crypto');

test('real privacy routes complete a mocked phone request while fulfillment stays disabled', {
  skip: process.env.PRIVACY_SYNTHETIC_DATABASE !== 'yes'
}, async () => {
  assert.equal(process.env.NODE_ENV, 'test');
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/speedy_privacy_synthetic');

  process.env.PRIVACY_ADMIN_USER_IDS = 'synthetic-route-admin';
  const { prisma: db } = require('../dist/lib/prisma');
  const { privacyRouter } = require('../dist/routes/privacy.routes');
  const {
    ADOPTED_COMPLETION_TIMEFRAME,
    PrivacyDeletionService,
    retainedFinancialFields
  } = require('../dist/services/privacyDeletion.service');
  const { signAuthToken } = require('../dist/utils/jwt');
  const delivered = new Map();
  const delivery = {
    async start(message) {
      delivered.set(message.id, message);
      return { reference: `synthetic-${message.id}` };
    },
    async check(message) {
      return message.channel === 'PHONE' && message.code === '654321' &&
        String(message.reference).startsWith('synthetic-');
    }
  };
  const service = new PrivacyDeletionService(
    db,
    'synthetic-route-digest-key-distinct-from-jwt',
    delivery,
    () => false,
    ADOPTED_COMPLETION_TIMEFRAME,
    '12-31',
    await require('./privacyRecoveryFixture.cjs').syntheticJournal('synthetic-route-digest-key-distinct-from-jwt')
  );
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use('/api/v1/privacy/deletion', privacyRouter(service));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/privacy/deletion`;
  const request = async (path, options = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) }
    });
    return { status: response.status, body: await response.json() };
  };

  const phone = `519${randomBytes(4).readUInt32BE().toString().slice(-7).padStart(7, '0')}`;
  const trackingToken = randomBytes(32).toString('base64url');
  const customer = await db.customer.create({ data: {
    fullName: 'Synthetic Route Customer', normalizedFullName: 'synthetic route customer',
    phone, normalizedPhone: phone, email: null, normalizedEmail: null,
    addressLine1: '93 Synthetic Street', city: 'Guelph', province: 'ON'
  } });
  const order = await db.order.create({ data: {
    customerId: customer.id, customerName: customer.fullName, phone, email: '',
    addressLine1: customer.addressLine1, city: customer.city, province: customer.province,
    itemsText: 'Synthetic route fixture', paymentMethod: 'CASH', orderSource: 'IOS_APP',
    orderStatus: 'DELIVERED',
    trackingTokenHash: createHash('sha256').update(trackingToken).digest('hex'),
    trackingTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
  } });
  await db.user.create({ data: {
    id: 'synthetic-route-admin', email: `${randomUUID()}@example.invalid`,
    passwordHash: 'synthetic-not-a-login', role: 'ADMIN', firstName: 'Synthetic', lastName: 'Admin'
  } });
  const adminToken = signAuthToken({
    userId: 'synthetic-route-admin', email: 'synthetic@example.invalid', role: 'ADMIN', authVersion: 0
  });

  try {
    const challenge = await request('/challenges', {
      method: 'POST', body: JSON.stringify({ trackingToken })
    });
    assert.equal(challenge.status, 200);
    assert.equal(challenge.body.channel, 'PHONE');
    assert.match(challenge.body.maskedDestination, new RegExp(phone.slice(-4) + '$'));
    assert.equal(challenge.body.completionTimeframe, ADOPTED_COMPLETION_TIMEFRAME);
    assert.equal(delivered.get(challenge.body.challengeId).to, `+1${phone}`);

    const accessToken = randomBytes(32).toString('hex');
    const verified = await request(`/challenges/${challenge.body.challengeId}/verify`, {
      method: 'POST', body: JSON.stringify({ code: '654321', accessToken })
    });
    assert.equal(verified.status, 200);
    assert.match(verified.body.proof, /^[a-f0-9]{64}$/);

    const requestId = randomUUID();
    const requestToken = randomBytes(32).toString('hex');
    const submitted = await request('/requests', {
      method: 'POST', headers: { authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ id: requestId, token: requestToken,
        challengeId: challenge.body.challengeId, proof: verified.body.proof })
    });
    assert.equal(submitted.status, 202);
    assert.equal(submitted.body.status, 'SUBMITTED');
    assert.ok(Date.parse(submitted.body.dueAt) >= Date.now() + 29 * 86400000);

    const status = await request(`/requests/${requestId}`, {
      headers: { authorization: `Bearer ${requestToken}` }
    });
    assert.equal(status.status, 200);
    assert.equal(status.body.status, 'SUBMITTED');

    const preview = await request(`/admin/requests/${requestId}/preview`, {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.sourceOrderId, order.id);
    assert.deepEqual(preview.body.financialFields, retainedFinancialFields);

    const currentYear = new Date().getUTCFullYear();
    const fulfill = await request(`/admin/requests/${requestId}/fulfill`, {
      method: 'POST', headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        version: preview.body.version, previewHash: preview.body.previewHash,
        decision: {
          policyReference: 'SS-RETENTION-2026-10-23',
          justification: 'Synthetic route test decision; fulfillment must remain disabled.',
          taxYearEnd: `${currentYear}-12-31`,
          financialRetainUntil: `${currentYear + 6}-12-31T23:59:59.999Z`,
          personalFields: [], financialFields: retainedFinancialFields,
          unlinkedRecordsReviewed: true, confirmed: true
        }
      })
    });
    assert.equal(fulfill.status, 503);
    assert.equal(fulfill.body.code, 'FULFILLMENT_DISABLED');
    assert.ok(await db.customer.findUnique({ where: { id: customer.id } }));
    assert.equal((await db.order.findUnique({ where: { id: order.id } })).privacyErasedAt, null);

    const cancelled = await request(`/requests/${requestId}/cancel`, {
      method: 'POST', headers: { authorization: `Bearer ${requestToken}` }, body: '{}'
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.status, 'CANCELLED');
    const finalStatus = await request(`/requests/${requestId}`, {
      headers: { authorization: `Bearer ${requestToken}` }
    });
    assert.equal(finalStatus.body.status, 'CANCELLED');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.$disconnect();
  }
});
