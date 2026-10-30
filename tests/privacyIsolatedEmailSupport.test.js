const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  isolatedChannel, normalizeCanadianPhone, normalizeEmail, validateFixtureInput
} = require('./privacyIsolatedEmailSupport.cjs');
const { ALLOWED_ORIGIN, allowedBase, saveProtectedRecord } = require('./privacyIsolatedEmailFixture.cjs');
const { importPayload, writeImport } = require('./privacyIsolatedSimulatorBootstrap.cjs');
const { sanitizedOutcome, assertFinalOutcome } = require('./privacyIsolatedEmailEvidence.cjs');

const fixtureRecord = () => ({
  version: 1, channel: 'EMAIL', baseURL: ALLOWED_ORIGIN,
  controlSecret: 'c'.repeat(32), trackingToken: 'a'.repeat(43),
  adminToken: 'b'.repeat(64), orderId: '11111111-2222-4333-8444-555555555555'
});

test('isolated channel is explicit and fail closed', () => {
  assert.equal(isolatedChannel({ PRIVACY_ISOLATED_CHANNEL: 'EMAIL' }), 'EMAIL');
  assert.equal(isolatedChannel({ PRIVACY_ISOLATED_CHANNEL: 'PHONE' }), 'PHONE');
  for (const value of [undefined, '', 'email', 'BOTH']) {
    assert.throws(() => isolatedChannel({ PRIVACY_ISOLATED_CHANNEL: value }), /exactly PHONE or EMAIL/);
  }
});

test('private fixture values are normalized without broadening the target', () => {
  assert.equal(normalizeCanadianPhone('+1 (519) 555-0123'), '5195550123');
  assert.equal(normalizeCanadianPhone('123'), null);
  assert.equal(normalizeEmail(' Owner@Test.Example '), 'owner@test.example');
  assert.equal(normalizeEmail('not-an-email'), null);
  const value = validateFixtureInput({
    fullName: 'Synthetic Owner', email: 'OWNER@test.example', phone: '+15195550123',
    addressLine1: '1 Synthetic Street', unitNumber: '', buzzCode: ''
  }, 'EMAIL');
  assert.deepEqual(value, {
    fullName: 'Synthetic Owner', email: 'owner@test.example', phone: '5195550123',
    addressLine1: '1 Synthetic Street', unitNumber: null, buzzCode: null
  });
  assert.throws(() => validateFixtureInput({ phone: '+15195550123' }, 'EMAIL'), /VALID_SYNTHETIC_NAME_REQUIRED/);
});

test('only the exact isolated origin is accepted', () => {
  assert.equal(allowedBase(ALLOWED_ORIGIN).origin, ALLOWED_ORIGIN);
  for (const value of [
    'http://speedy-privacy-isolated.onrender.com',
    'https://speedy-api-lbfe.onrender.com',
    'https://user:private@speedy-privacy-isolated.onrender.com',
    `${ALLOWED_ORIGIN}/unexpected`, `${ALLOWED_ORIGIN}?target=production`
  ]) assert.throws(() => allowedBase(value));
});

test('protected fixture and simulator import files exclude unrelated credentials', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speedy-email-isolated-'));
  try {
    fs.chmodSync(root, 0o700);
    const protectedFile = path.join(root, 'fixture.json');
    saveProtectedRecord(fixtureRecord(), protectedFile);
    assert.equal(fs.statSync(protectedFile).mode & 0o077, 0);
    const payload = importPayload(fixtureRecord());
    assert.deepEqual(Object.keys(payload).sort(), ['armedForOneEmail', 'orderId', 'trackingToken', 'version']);
    assert.equal(JSON.stringify(payload).includes('controlSecret'), false);
    assert.equal(JSON.stringify(payload).includes('adminToken'), false);
    const container = path.join(root, 'container'); fs.mkdirSync(container);
    const importFile = writeImport(container, payload);
    assert.equal(fs.statSync(importFile).mode & 0o077, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('server source keeps provider and gate modes mutually exclusive', () => {
  const source = fs.readFileSync(path.join(__dirname, 'privacyIsolatedServer.cjs'), 'utf8');
  assert.match(source, /channel === 'PHONE' \? 'true' : 'false'/);
  assert.match(source, /channel === 'EMAIL' \? 'true' : 'false'/);
  assert.match(source, /absent\('TWILIO_ACCOUNT_SID'\)/);
  assert.match(source, /absent\('RESEND_API_KEY'\)/);
  assert.match(source, /Speedy Sweeties <no-reply@notify\.speedysweeties\.ca>/);
  assert.match(source, /verificationAttempts !== 0/);
  assert.match(source, /ONE_MESSAGE_LIMIT_REACHED/);
  assert.match(source, /syntheticJournal\(digestSecret, prisma\)/);
  assert.doesNotMatch(source, /configuredPrivacyRecovery/);
  for (const name of ['AWS_ACCESS_KEY_ID', 'PRIVACY_RECOVERY_S3_BUCKET', 'PRIVACY_RECOVERY_ENROLLMENT_HASH']) {
    assert.match(source, new RegExp(`'${name}'`));
  }
});

test('final evidence accepts only one verified cancelled request with unchanged records', () => {
  const final = {
    fixtureCreated: true, challengeCount: 1, sentChallenges: 1, verifiedChallenges: 1, accessCount: 1,
    requestCount: 1, requestId: 'private-id', requestStatus: 'CANCELLED', dueAtRecorded: true,
    databaseErased: false, customerPresent: true, orderErased: false
  };
  assert.equal(assertFinalOutcome(final).finalStatus, 'CANCELLED');
  assert.deepEqual(Object.keys(sanitizedOutcome(final)).sort(), [
    'accessCount', 'challengeCount', 'customerPresent', 'databaseErased', 'dueAtRecorded',
    'orderErased', 'requestCount', 'requestStatus', 'verifiedChallenges'
  ].concat('sentChallenges').sort());
  assert.doesNotMatch(JSON.stringify(sanitizedOutcome(final)), /private-id/);
  for (const patch of [
    { challengeCount: 2 }, { verifiedChallenges: 0 }, { accessCount: 2 },
    { requestStatus: 'SUBMITTED' }, { databaseErased: true }, { customerPresent: false }, { orderErased: true }
  ]) assert.throws(() => assertFinalOutcome({ ...final, ...patch }));
});
