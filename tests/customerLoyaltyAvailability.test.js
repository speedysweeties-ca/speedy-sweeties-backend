const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://unused:unused@127.0.0.1:5432/unused';
process.env.JWT_SECRET ||= 'loyalty-unit-only-key';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||= '{}';

const jwt = require('jsonwebtoken');
const { prisma } = require('../dist/lib/prisma');
const loyalty = require('../dist/services/loyalty.service');
const { signCustomerLoyaltyToken } = require('../dist/utils/jwt');
const { ApiError } = require('../dist/utils/ApiError');
const { getCustomerLoyaltyByTokenController: lookup } = require('../dist/controllers/customer.controller');

const snapshot = { loyaltyCompletedOrders: 4, loyaltyRewardsEarned: 1,
  loyaltyRewardsUsed: 1, loyaltyFreeDelivery: false };
const expected = { success: true, found: true, loyalty: { ...snapshot, deliveriesRemaining: 6 } };
const unavailable = { success: false, code: 'LOYALTY_TEMPORARILY_UNAVAILABLE',
  message: 'Loyalty information is temporarily unavailable. Please try again.' };
const unauthorized = { success: false, message: 'Unauthorized' };

function fixture(t) {
  const oldRevocation = prisma.systemSetting.findUnique;
  const oldSnapshot = loyalty.getCustomerLoyaltySnapshot;
  const state = { revocation: null, revocationFailure: null, snapshot: { ...snapshot },
    snapshotFailure: null, revocationReads: 0, snapshotReads: 0 };
  prisma.systemSetting.findUnique = async () => {
    state.revocationReads++;
    if (state.revocationFailure) throw state.revocationFailure;
    return state.revocation;
  };
  loyalty.getCustomerLoyaltySnapshot = async id => {
    assert.equal(id, 'loyalty-test-customer');
    state.snapshotReads++;
    if (state.snapshotFailure) throw state.snapshotFailure;
    return state.snapshot;
  };
  t.after(() => {
    prisma.systemSetting.findUnique = oldRevocation;
    loyalty.getCustomerLoyaltySnapshot = oldSnapshot;
  });
  return state;
}

async function request(token) {
  const res = { code: 200, body: null, status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await lookup({ headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
  return res;
}

test('a valid credential retains the existing successful loyalty response', async t => {
  const state = fixture(t);
  const res = await request(signCustomerLoyaltyToken('loyalty-test-customer'));
  assert.equal(res.code, 200); assert.deepEqual(res.body, expected);
  assert.equal(state.revocationReads, 1); assert.equal(state.snapshotReads, 1);
});

test('missing, malformed, expired and wrong-scope tokens remain 401 without database reads', async t => {
  const state = fixture(t);
  const secret = createHmac('sha256', process.env.JWT_SECRET).update('speedy-customer-loyalty-v1').digest('hex');
  const expired = jwt.sign({ sub: 'loyalty-test-customer', scope: 'customer-loyalty' }, secret, { expiresIn: -1 });
  const wrongScope = jwt.sign({ sub: 'loyalty-test-customer', scope: 'other' }, secret);
  for (const token of [null, 'not-a-jwt', expired, wrongScope]) {
    const res = await request(token);
    assert.equal(res.code, 401); assert.deepEqual(res.body, unauthorized);
  }
  assert.equal(state.revocationReads, 0); assert.equal(state.snapshotReads, 0);
});

test('revoked credentials and corrupt revocation records still fail closed', async t => {
  const state = fixture(t);
  const token = signCustomerLoyaltyToken('loyalty-test-customer');
  const record = { version: 1, event: 'EXPOSED_SYNTHETIC_CREDENTIALS_REVOKED',
    sourceOrderId: '00000000-0000-4000-8000-000000000001', actorId: 'test-owner',
    revokedAt: new Date().toISOString(), loyaltyIssuedThrough: Math.floor(Date.now() / 1000) + 60 };
  for (const value of [JSON.stringify(record), 'not-json', '{}']) {
    state.revocation = { value };
    const res = await request(token);
    assert.equal(res.code, 401); assert.deepEqual(res.body, unauthorized);
  }
  assert.equal(state.snapshotReads, 0);
});

test('revocation database failure returns 503 without bypassing the check', async t => {
  const state = fixture(t);
  state.revocationFailure = Error('internal database details must not escape');
  const token = signCustomerLoyaltyToken('loyalty-test-customer');
  const failed = await request(token);
  assert.equal(failed.code, 503); assert.deepEqual(failed.body, unavailable);
  assert.equal(state.snapshotReads, 0);
  state.revocationFailure = null;
  const retried = await request(token);
  assert.equal(retried.code, 200); assert.deepEqual(retried.body, expected);
});

test('a loyalty transaction failure is retryable with the same credential', async t => {
  const state = fixture(t);
  const token = signCustomerLoyaltyToken('loyalty-test-customer');
  state.snapshotFailure = Error('transaction timeout');
  const failed = await request(token);
  assert.equal(failed.code, 503); assert.deepEqual(failed.body, unavailable);
  state.snapshotFailure = null;
  const retried = await request(token);
  assert.equal(retried.code, 200); assert.deepEqual(retried.body, expected);
});

test('a missing or deleted customer remains unauthorized', async t => {
  const state = fixture(t); state.snapshot = null;
  const res = await request(signCustomerLoyaltyToken('loyalty-test-customer'));
  assert.equal(res.code, 401); assert.deepEqual(res.body, unauthorized);
});

test('only explicit revocation denial can invalidate a verified credential', async t => {
  const state = fixture(t); state.snapshotFailure = new ApiError(401, 'downstream failure');
  const res = await request(signCustomerLoyaltyToken('loyalty-test-customer'));
  assert.equal(res.code, 503); assert.deepEqual(res.body, unavailable);
});

test('HTTP loyalty route returns 503 during an outage and 200 after recovery', async t => {
  const state = fixture(t);
  const express = require('express');
  const routes = require('../dist/routes/customer.routes').default;
  const app = express(); app.use('/customers', routes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const token = signCustomerLoyaltyToken('loyalty-test-customer');
  const fetchLoyalty = () => fetch(`http://127.0.0.1:${server.address().port}/customers/loyalty-token`,
    { headers: { Authorization: `Bearer ${token}` } });
  state.snapshotFailure = Error('temporary outage');
  let res = await fetchLoyalty();
  assert.equal(res.status, 503); assert.deepEqual(await res.json(), unavailable);
  state.snapshotFailure = null;
  res = await fetchLoyalty();
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), expected);
});
