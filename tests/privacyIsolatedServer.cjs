// Test-only Render entry point. It deliberately does not import src/server or src/app.
const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const express = require('express');
const { ISOLATED_ROUTES, createControlAuthorizer } = require('./privacyIsolatedContract.cjs');
const { collectTwilioDiagnostics } = require('./privacyTwilioDiagnostics.cjs');
const { validateAuthorizedRenderTarget } = require('./privacyRenderTarget.cjs');
const {
  isolatedChannel, maskEmail, validateFixtureInput,
  auditFullApplicationTableState, sanitizedStartupFailure
} = require('./privacyIsolatedEmailSupport.cjs');

const exact = (name, expected) => assert.equal(process.env[name], expected, `${name} must equal ${expected}`);
const absent = name => assert.ok(!process.env[name], `${name} must be unset in the isolated service`);
const secret = name => {
  const value = process.env[name] || '';
  assert.ok(value.length >= 32, `${name} must be a distinct secret of at least 32 characters`);
  return value;
};

exact('NODE_ENV', 'test');
exact('PRIVACY_SYNTHETIC_DATABASE', 'yes');
exact('PRIVACY_ISOLATED_RENDER', 'yes');
const channel = isolatedChannel(process.env);
const diagnosticsOnly = process.env.PRIVACY_ISOLATED_DIAGNOSTICS_ONLY === 'true';
exact('PRIVACY_DELETION_ENABLED', diagnosticsOnly ? 'false' : 'true');
exact('PRIVACY_VERIFICATION_PHONE_ENABLED', diagnosticsOnly ? 'false' : channel === 'PHONE' ? 'true' : 'false');
exact('PRIVACY_VERIFICATION_EMAIL_ENABLED', diagnosticsOnly ? 'false' : channel === 'EMAIL' ? 'true' : 'false');
exact('PRIVACY_FULFILLMENT_ENABLED', 'false');
exact('PRIVACY_APPROVED_RETENTION_POLICY', 'SS-RETENTION-2026-10-23');
exact('PRIVACY_FISCAL_YEAR_END_MM_DD', '12-31');
exact('PRIVACY_COMPLETION_TIMEFRAME', 'Normally within 30 calendar days after verification; an ownership conflict or legal hold may require longer.');
exact('PRIVACY_ADMIN_USER_IDS', 'synthetic-isolated-admin');
exact('AUTO_DISPATCH_ENABLED', 'false');
exact('BND_MONITOR_ENABLED', 'false');
exact('AI_PRODUCT_WEB_LOOKUP_ENABLED', 'false');
exact('FIREBASE_SERVICE_ACCOUNT_JSON', '{}');
validateAuthorizedRenderTarget(process.env);
assert.ok(!process.env.PRIVACY_ISOLATED_CLEANUP, 'cleanup authorization must be removed before isolated server startup');
assert.ok(!process.env.PRIVACY_ISOLATED_WRITERS_EXCLUDED, 'writer-exclusion authorization must be removed before isolated server startup');
if (process.env.PRIVACY_ISOLATED_RESET === 'execute-once') {
  assert.equal(diagnosticsOnly, true, 'reset authorization may only remain during a diagnostics-only reset deploy');
}

const jwtSecret = secret('JWT_SECRET');
const digestSecret = secret('PRIVACY_DIGEST_KEY');
const controlSecret = secret('PRIVACY_ISOLATED_CONTROL_SECRET');
assert.equal(new Set([jwtSecret, digestSecret, controlSecret]).size, 3, 'isolated secrets must be distinct');
if (channel === 'PHONE') {
  secret('TWILIO_ACCOUNT_SID');
  secret('TWILIO_AUTH_TOKEN');
  secret('TWILIO_VERIFY_SERVICE_SID');
  absent('RESEND_API_KEY');
  absent('PRIVACY_VERIFICATION_FROM');
} else {
  secret('RESEND_API_KEY');
  exact('PRIVACY_VERIFICATION_FROM', 'Speedy Sweeties <no-reply@notify.speedysweeties.ca>');
  absent('TWILIO_ACCOUNT_SID');
  absent('TWILIO_AUTH_TOKEN');
  absent('TWILIO_VERIFY_SERVICE_SID');
}

for (const name of [
  'BND_LOGIN_EMAIL', 'BND_LOGIN_PASSWORD',
  'OPENAI_API_KEY', 'GOOGLE_PLACES_API_KEY', 'GOOGLE_GEOCODING_API_KEY', 'GOOGLE_ROUTES_API_KEY',
  'UNDISPATCHED_ALERT_EMAIL', 'UNDISPATCHED_ALERT_FROM',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_ROLE_ARN',
  'AWS_WEB_IDENTITY_TOKEN_FILE', 'PRIVACY_RECOVERY_S3_BUCKET', 'PRIVACY_RECOVERY_S3_PREFIX',
  'PRIVACY_RECOVERY_S3_EXPECTED_OWNER', 'PRIVACY_RECOVERY_S3_REGION', 'PRIVACY_RECOVERY_SCOPE',
  'PRIVACY_RECOVERY_ENROLLMENT_HASH'
]) absent(name);

const { prisma } = require('../dist/lib/prisma');
const { privacyRouter } = require('../dist/routes/privacy.routes');
const { PrivacyDeletionService } = require('../dist/services/privacyDeletion.service');
const { privacyVerificationDelivery } = require('../dist/services/privacyDelivery.service');
const { signAuthToken } = require('../dist/utils/jwt');
const { syntheticJournal } = require('./privacyRecoveryFixture.cjs');

const authorize = createControlAuthorizer(controlSecret);
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '8kb' }));
app.get('/health', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ok', scope: 'privacy-isolated-synthetic' }); }
  catch { res.status(503).json({ status: 'unavailable' }); }
});

let fixture;
let verificationAttempts = 0;
if (!diagnosticsOnly) app.get(ISOLATED_ROUTES.preflight, authorize, (_req, res) => {
  res.json({
    ready: true,
    fixtureCreated: Boolean(fixture),
    verificationChannel: channel,
    phoneVerificationEnabled: process.env.PRIVACY_VERIFICATION_PHONE_ENABLED === 'true',
    emailVerificationEnabled: process.env.PRIVACY_VERIFICATION_EMAIL_ENABLED === 'true',
    fulfillmentEnabled: process.env.PRIVACY_FULFILLMENT_ENABLED === 'true'
  });
});

if (!diagnosticsOnly) app.post(ISOLATED_ROUTES.fixture, authorize, async (req, res) => {
  if (fixture) { res.status(409).json({ code: 'FIXTURE_ALREADY_CREATED' }); return; }
  let input;
  try { input = validateFixtureInput(req.body, channel); }
  catch (error) { res.status(400).json({ code: error.message }); return; }
  const trackingToken = randomBytes(32).toString('base64url');
  const { customer, order } = await prisma.$transaction(async tx => {
    const customer = await tx.customer.create({ data: {
      fullName: input.fullName, normalizedFullName: input.fullName.toLowerCase(),
      phone: input.phone, normalizedPhone: input.phone, email: input.email, normalizedEmail: input.email,
      addressLine1: input.addressLine1, unitNumber: input.unitNumber, buzzCode: input.buzzCode,
      city: 'Guelph', province: 'ON'
    } });
    const order = await tx.order.create({ data: {
      customerId: customer.id, customerName: customer.fullName, phone: input.phone, email: input.email || '',
      addressLine1: customer.addressLine1, city: customer.city, province: customer.province,
      itemsText: 'Synthetic isolated privacy fixture', paymentMethod: 'CASH',
      orderSource: 'IOS_APP', orderStatus: 'DELIVERED',
      trackingTokenHash: createHash('sha256').update(trackingToken).digest('hex'),
      trackingTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    } });
    await tx.user.create({ data: {
      id: 'synthetic-isolated-admin', email: 'privacy-isolated-admin@example.invalid',
      passwordHash: 'synthetic-not-a-login', role: 'ADMIN', firstName: 'Synthetic', lastName: 'Admin'
    } });
    return { customer, order };
  });
  fixture = { customerId: customer.id, orderId: order.id };
  const adminToken = signAuthToken({
    userId: 'synthetic-isolated-admin', email: 'privacy-isolated-admin@example.invalid',
    role: 'ADMIN', authVersion: 0
  });
  res.json({ trackingToken, adminToken, orderId: order.id,
    ...(channel === 'EMAIL' ? { maskedDestination: maskEmail(input.email) } : {}) });
});

if (!diagnosticsOnly) app.get(ISOLATED_ROUTES.unchanged, authorize, async (_req, res) => {
  if (!fixture) { res.status(404).json({ code: 'FIXTURE_NOT_CREATED' }); return; }
  const [customer, order] = await Promise.all([
    prisma.customer.findUnique({ where: { id: fixture.customerId }, select: { id: true } }),
    prisma.order.findUnique({ where: { id: fixture.orderId }, select: { privacyErasedAt: true } })
  ]);
  res.json({ customerPresent: !!customer, orderErased: !!order?.privacyErasedAt });
});

if (!diagnosticsOnly) app.get(ISOLATED_ROUTES.outcome, authorize, async (_req, res) => {
  if (!fixture) { res.status(404).json({ code: 'FIXTURE_NOT_CREATED' }); return; }
  const [challengeCount, sentChallenges, verifiedChallenges, accessCount, requests, customer, order] = await Promise.all([
    prisma.privacyChallenge.count({ where: { subjectId: fixture.customerId } }),
    prisma.privacyChallenge.count({ where: { subjectId: fixture.customerId, delivery: 'SENT' } }),
    prisma.privacyChallenge.count({ where: { subjectId: fixture.customerId, verifiedAt: { not: null } } }),
    prisma.privacyAccessCredential.count({ where: { customerId: fixture.customerId } }),
    prisma.privacyDeletionRequest.findMany({ where: { subjectId: fixture.customerId }, select: {
      id: true, status: true, dueAt: true, databaseErasedAt: true
    } }),
    prisma.customer.findUnique({ where: { id: fixture.customerId }, select: { id: true } }),
    prisma.order.findUnique({ where: { id: fixture.orderId }, select: { privacyErasedAt: true } })
  ]);
  res.json({
    fixtureCreated: true, challengeCount, sentChallenges, verifiedChallenges, accessCount,
    requestCount: requests.length, requestId: requests.length === 1 ? requests[0].id : null,
    requestStatus: requests.length === 1 ? requests[0].status : null,
    dueAtRecorded: requests.length === 1 && requests[0].dueAt instanceof Date,
    databaseErased: requests.some(request => request.databaseErasedAt !== null),
    customerPresent: !!customer, orderErased: !!order?.privacyErasedAt
  });
});

let server;
let startupStage = 'STARTUP';
(async () => {
  if (diagnosticsOnly && channel === 'PHONE') {
    startupStage = 'DIAGNOSTIC';
    const diagnostic = await collectTwilioDiagnostics({
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      serviceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
      after: process.env.PRIVACY_ISOLATED_DIAGNOSTIC_AFTER,
      before: process.env.PRIVACY_ISOLATED_DIAGNOSTIC_BEFORE
    });
    console.log(`[privacy-isolated] twilio diagnostic ${JSON.stringify(diagnostic)}`);
  } else if (!diagnosticsOnly) {
    startupStage = 'DATABASE_AUDIT';
    const databaseAudit = await auditFullApplicationTableState(prisma);
    console.log(`[privacy-isolated] full application-table audit verified empty (${databaseAudit.tableCount} tables)`);
    startupStage = 'RECOVERY_SETUP';
    const recovery = await syntheticJournal(digestSecret, prisma);
    const service = new PrivacyDeletionService(
      prisma,
      digestSecret,
      privacyVerificationDelivery({
        resendApiKey: process.env.RESEND_API_KEY || '',
        resendFrom: process.env.PRIVACY_VERIFICATION_FROM || '',
        emailEnabled: channel === 'EMAIL',
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
        twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
        twilioVerifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',
        phoneEnabled: channel === 'PHONE'
      }),
      () => false,
      process.env.PRIVACY_COMPLETION_TIMEFRAME,
      process.env.PRIVACY_FISCAL_YEAR_END_MM_DD,
      recovery
    );
    app.post('/api/v1/privacy/deletion/challenges', (req, res, next) => {
      if (verificationAttempts !== 0) {
        res.set('Cache-Control', 'no-store');
        res.status(409).json({ code: 'ONE_MESSAGE_LIMIT_REACHED' });
        return;
      }
      // Consume the allowance before any provider call. An ambiguous or rejected
      // outcome must never become an implicit authorization to retry.
      verificationAttempts = 1;
      next();
    });
    app.use('/api/v1/privacy/deletion', privacyRouter(service));
    app.use((_error, _req, res, _next) => {
      res.set('Cache-Control', 'no-store');
      res.status(503).json({ code: 'PRIVACY_ISOLATED_OPERATION_STOPPED' });
    });
  }
  startupStage = 'LISTENER';
  const port = Number(process.env.PORT || 4000);
  server = await new Promise((resolve, reject) => {
    const listening = app.listen(port, '0.0.0.0', () => resolve(listening));
    listening.once('error', reject);
  });
  if (!diagnosticsOnly) {
    startupStage = 'LOOPBACK_PREFLIGHT';
    const response = await fetch(`http://127.0.0.1:${port}${ISOLATED_ROUTES.preflight}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${controlSecret}` },
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ready: true,
      fixtureCreated: false,
      verificationChannel: channel,
      phoneVerificationEnabled: channel === 'PHONE',
      emailVerificationEnabled: channel === 'EMAIL',
      fulfillmentEnabled: false,
    });
    console.log('[privacy-isolated] authenticated loopback preflight verified; no fixture or message created');
  }
  console.log(diagnosticsOnly
    ? `[privacy-isolated] ready on port ${port}; diagnostics only, messaging routes absent`
    : `[privacy-isolated] ready on port ${port}; no fixture or message created`);
})().catch(async () => {
  console.error(`[privacy-isolated] ${JSON.stringify(sanitizedStartupFailure(startupStage))}`);
  if (server) await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
  process.exitCode = 1;
});
