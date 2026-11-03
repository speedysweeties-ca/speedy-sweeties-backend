const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runWithAuthorizedRenderTarget,
} = require('./privacyRenderTarget.cjs');
const { validateSyntheticFixtureSnapshot } = require('./privacyRenderReset.cjs');

const authorizedEnvironment = () => ({
  NODE_ENV: 'test',
  PRIVACY_SYNTHETIC_DATABASE: 'yes',
  PRIVACY_ISOLATED_RENDER: 'yes',
  RENDER: 'true',
  RENDER_SERVICE_ID: 'srv-dbe3861srm7s73dgfe50',
  RENDER_SERVICE_NAME: 'speedy-privacy-isolated',
  PRIVACY_EXPECTED_DATABASE_RESOURCE_ID: 'dpg-dbe37v59fdbs73961o3g-a',
  PRIVACY_EXPECTED_DATABASE_HOST: 'dpg-dbe37v59fdbs73961o3g-a',
  DATABASE_URL: 'postgresql://speedy_privacy_synthetic_user:private@dpg-dbe37v59fdbs73961o3g-a/speedy_privacy_synthetic',
});

const syntheticSnapshot = () => {
  const customer = {
    id: 'customer-id', fullName: 'Synthetic Isolated Customer',
    normalizedFullName: 'synthetic isolated customer', phone: '5195550123',
    normalizedPhone: '5195550123', email: null, normalizedEmail: null,
    addressLine1: '93 Synthetic Street', city: 'Guelph', province: 'ON',
  };
  const order = {
    id: 'order-id', customerId: customer.id, customerName: customer.fullName,
    phone: customer.phone, email: '', addressLine1: customer.addressLine1,
    itemsText: 'Synthetic isolated privacy fixture', paymentMethod: 'CASH',
    orderSource: 'IOS_APP', orderStatus: 'DELIVERED', privacyErasedAt: null,
    trackingTokenHash: 'a'.repeat(64),
  };
  return {
    counts: {
      Customer: 1, Order: 1, User: 1, PrivacyChallenge: 1,
      PrivacyDeletionRequest: 0, PrivacyAudit: 0, _prisma_migrations: 4,
    },
    customer,
    order,
    user: {
      id: 'synthetic-isolated-admin', email: 'privacy-isolated-admin@example.invalid',
      passwordHash: 'synthetic-not-a-login', role: 'ADMIN', firstName: 'Synthetic', lastName: 'Admin',
    },
    challenge: {
      subjectId: customer.id, sourceOrderId: order.id, accessId: null,
      purpose: 'ENROLL_DELETE', channel: 'PHONE', destinationHash: 'b'.repeat(64),
      phoneHash: 'b'.repeat(64), requesterHash: 'c'.repeat(64), codeHash: 'd'.repeat(64),
      contactFingerprint: 'e'.repeat(64), providerReference: null,
      completionTimeframe: 'Normally within 30 calendar days after verification; an ownership conflict or legal hold may require longer.',
      delivery: 'UNAVAILABLE', attempts: 0, verifiedAt: null, consumedAt: null,
    },
  };
};

test('authorized Render target reaches the operation only after every identity check passes', () => {
  let reached = false;
  runWithAuthorizedRenderTarget(authorizedEnvironment(), () => { reached = true; });
  assert.equal(reached, true);
});

for (const [name, mutate] of [
  ['service ID', env => { env.RENDER_SERVICE_ID = 'srv-d7ntlnpkh4rs73bev9q0'; }],
  ['service name', env => { env.RENDER_SERVICE_NAME = 'speedy-ordering-staging'; }],
  ['database resource ID', env => { env.PRIVACY_EXPECTED_DATABASE_RESOURCE_ID = 'dpg-d7m33g2qqhas73f58hrg-a'; }],
  ['database host', env => {
    env.PRIVACY_EXPECTED_DATABASE_HOST = 'dpg-d7m33g2qqhas73f58hrg-a';
    env.DATABASE_URL = 'postgresql://speedy_privacy_synthetic_user:private@dpg-d7m33g2qqhas73f58hrg-a/speedy_privacy_synthetic';
  }],
  ['database name', env => { env.DATABASE_URL = env.DATABASE_URL.replace('/speedy_privacy_synthetic', '/speedy_sweeties_db'); }],
  ['database user', env => { env.DATABASE_URL = env.DATABASE_URL.replace('speedy_privacy_synthetic_user', 'speedy_sweeties_db_user'); }],
]) {
  test(`incorrect ${name} is rejected before the operation`, () => {
    const env = authorizedEnvironment();
    mutate(env);
    let reached = false;
    assert.throws(() => runWithAuthorizedRenderTarget(env, () => { reached = true; }));
    assert.equal(reached, false);
  });
}

test('fixture audit accepts the exact synthetic pre-acceptance failure state', () => {
  assert.equal(validateSyntheticFixtureSnapshot(syntheticSnapshot()), 'synthetic-fixture');
});

test('fixture audit accepts the exact synthetic accepted-but-unverified state', () => {
  const snapshot = syntheticSnapshot();
  snapshot.challenge.delivery = 'SENT';
  snapshot.challenge.providerReference = `VE${'a'.repeat(32)}`;
  assert.equal(validateSyntheticFixtureSnapshot(snapshot), 'synthetic-fixture');
});

test('fixture audit rejects a sent challenge without a valid Twilio verification reference', () => {
  const snapshot = syntheticSnapshot();
  snapshot.challenge.delivery = 'SENT';
  snapshot.challenge.providerReference = 'private-provider-value';
  assert.throws(
    () => validateSyntheticFixtureSnapshot(snapshot),
    error => {
      assert.match(error.message, /challenge provider\/delivery state mismatch/);
      assert.doesNotMatch(error.message, /private-provider-value|5195550123/);
      return true;
    },
  );
});

test('fixture audit rejects altered fixture markers without echoing private values', () => {
  const snapshot = syntheticSnapshot();
  snapshot.customer.fullName = 'private customer value';
  assert.throws(
    () => validateSyntheticFixtureSnapshot(snapshot),
    error => {
      assert.match(error.message, /customer marker mismatch/);
      assert.doesNotMatch(error.message, /private customer value|5195550123/);
      return true;
    },
  );
});

test('fixture audit rejects every unexpected populated table', () => {
  const snapshot = syntheticSnapshot();
  snapshot.counts.DigitalReceipt = 1;
  assert.throws(() => validateSyntheticFixtureSnapshot(snapshot), /unexpected rows in DigitalReceipt/);
});

test('legacy destructive reset refuses the completed email fixture until separately reviewed', () => {
  const snapshot = syntheticSnapshot();
  snapshot.customer.fullName = 'Owner-selected private synthetic name';
  snapshot.customer.email = 'owner@example.invalid';
  snapshot.customer.normalizedEmail = 'owner@example.invalid';
  snapshot.challenge.channel = 'EMAIL';
  snapshot.counts.PrivacyAccessCredential = 1;
  snapshot.counts.PrivacyDeletionRequest = 1;
  snapshot.counts.PrivacyAudit = 2;
  assert.throws(
    () => validateSyntheticFixtureSnapshot(snapshot),
    error => {
      assert.match(error.message, /unexpected rows|customer marker mismatch/);
      assert.doesNotMatch(error.message, /owner@example|Owner-selected/);
      return true;
    }
  );
});

test('fixture audit recognizes an empty application schema without requiring fixture rows', () => {
  assert.equal(validateSyntheticFixtureSnapshot({ counts: {
    Customer: 0, Order: 0, User: 0, PrivacyChallenge: 0, _prisma_migrations: 4,
  } }), 'empty');
});
