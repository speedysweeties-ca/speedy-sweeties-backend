const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  REQUIRED_STARTUP_TABLES,
  isolatedChannel, normalizeCanadianPhone, normalizeEmail, approvedOwnerEmail,
  maskEmail, validateFixtureInput, auditFullApplicationTableState,
  sanitizedStartupFailure
} = require('./privacyIsolatedEmailSupport.cjs');
const { ALLOWED_ORIGIN, allowedBase, saveProtectedRecord } = require('./privacyIsolatedEmailFixture.cjs');
const { importPayload, armingPrompt, writeImport } = require('./privacyIsolatedSimulatorBootstrap.cjs');
const {
  sanitizedOutcome, assertSourceBinding, assertFinalOutcome
} = require('./privacyIsolatedEmailEvidence.cjs');

const fixtureRecord = () => ({
  version: 1, channel: 'EMAIL', baseURL: ALLOWED_ORIGIN,
  controlSecret: 'c'.repeat(32), trackingToken: 'a'.repeat(43),
  adminToken: 'b'.repeat(64), orderId: '11111111-2222-4333-8444-555555555555',
  maskedDestination: 's***@hotmail.com'
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
  assert.equal(approvedOwnerEmail(' SpeedySweeties@Hotmail.com '), true);
  assert.equal(approvedOwnerEmail('other@example.invalid'), false);
  assert.equal(maskEmail(' SpeedySweeties@Hotmail.com '), 's***@hotmail.com');
  const value = validateFixtureInput({
    fullName: 'Synthetic Owner', email: 'SpeedySweeties@Hotmail.com', phone: '+15195550123',
    addressLine1: '1 Synthetic Street', unitNumber: '', buzzCode: ''
  }, 'EMAIL');
  assert.deepEqual(value, {
    fullName: 'Synthetic Owner', email: 'speedysweeties@hotmail.com', phone: '5195550123',
    addressLine1: '1 Synthetic Street', unitNumber: null, buzzCode: null
  });
  assert.throws(() => validateFixtureInput({ phone: '+15195550123' }, 'EMAIL'), /VALID_SYNTHETIC_NAME_REQUIRED/);
  assert.throws(() => validateFixtureInput({
    fullName: 'Synthetic Owner', email: 'other@example.invalid', phone: '+15195550123',
    addressLine1: '1 Synthetic Street'
  }, 'EMAIL'), /APPROVED_OWNER_EMAIL_REQUIRED/);
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
    const prompt = armingPrompt(fixtureRecord());
    assert.match(prompt, /Approved destination s\*\*\*@hotmail\.com/);
    assert.match(prompt, /ARM ONE EMAIL/);
    assert.doesNotMatch(prompt, /speedysweeties@hotmail\.com/);
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
  assert.match(source, /auditFullApplicationTableState\(prisma\)/);
  assert.match(source, /sanitizedStartupFailure\(startupStage\)/);
  assert.match(source, /!process\.env\.PRIVACY_ISOLATED_CLEANUP/);
  assert.match(source, /!process\.env\.PRIVACY_ISOLATED_WRITERS_EXCLUDED/);
  assert.doesNotMatch(source, /configuredPrivacyRecovery/);
  for (const name of ['AWS_ACCESS_KEY_ID', 'PRIVACY_RECOVERY_S3_BUCKET', 'PRIVACY_RECOVERY_ENROLLMENT_HASH']) {
    assert.match(source, new RegExp(`'${name}'`));
  }
});

const startupPrisma = counts => ({
  $queryRawUnsafe: async query => {
    if (query.includes('information_schema.tables')) {
      return Object.keys(counts).map(table_name => ({ table_name }));
    }
    const table = query.match(/FROM "([^"]+)"/)?.[1];
    assert.ok(table && Object.hasOwn(counts, table), `Unexpected table query: ${query}`);
    return [{ count: counts[table] }];
  },
  customer: { findFirst: async () => null },
  order: { findFirst: async () => null },
  user: { findFirst: async () => null },
  privacyChallenge: { findFirst: async () => null }
});

test('isolated startup audits every application table and accepts only an empty schema', async () => {
  const empty = Object.fromEntries(REQUIRED_STARTUP_TABLES.map(table => [table, 0]));
  empty._prisma_migrations = 4;
  assert.deepEqual(await auditFullApplicationTableState(startupPrisma(empty)), {
    state: 'empty', tableCount: REQUIRED_STARTUP_TABLES.length + 1
  });
  await assert.rejects(
    auditFullApplicationTableState(startupPrisma({ ...empty, PrivacyAudit: 1 })),
    /Synthetic reset refused: unexpected rows in/
  );
  const { OrderEditPause: _omitted, ...incomplete } = empty;
  await assert.rejects(
    auditFullApplicationTableState(startupPrisma(incomplete)),
    /ISOLATED_DATABASE_SCHEMA_INCOMPLETE/
  );
});

test('startup failure evidence contains only a bounded sanitized category', () => {
  assert.deepEqual(sanitizedStartupFailure('DATABASE_AUDIT'), {
    check: 'SPEEDY_PRIVACY_ISOLATED_STARTUP', result: 'REFUSED', category: 'DATABASE_AUDIT'
  });
  assert.deepEqual(sanitizedStartupFailure('private database URL and password'), {
    check: 'SPEEDY_PRIVACY_ISOLATED_STARTUP', result: 'REFUSED', category: 'STARTUP'
  });
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

test('source-binding evidence requires the exact sole protected order and no conflicts', () => {
  const orderId = '11111111-2222-4333-8444-555555555555';
  const preview = {
    orderCount: 1, sourceOrderId: orderId,
    activeOrders: [], unlinkedOrderIds: [], conflictingLinkedOrderIds: []
  };
  assert.doesNotThrow(() => assertSourceBinding(preview, orderId));
  for (const patch of [
    { orderCount: 2 },
    { sourceOrderId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
    { activeOrders: ['unexpected'] },
    { unlinkedOrderIds: ['unexpected'] },
    { conflictingLinkedOrderIds: ['unexpected'] }
  ]) assert.throws(() => assertSourceBinding({ ...preview, ...patch }, orderId));
});
