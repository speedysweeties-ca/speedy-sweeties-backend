// Test-only Render entry point. It deliberately does not import src/server or src/app.
const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const express = require('express');
const { ISOLATED_ROUTES, createControlAuthorizer } = require('./privacyIsolatedContract.cjs');
const { collectTwilioDiagnostics } = require('./privacyTwilioDiagnostics.cjs');

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
const diagnosticsOnly = process.env.PRIVACY_ISOLATED_DIAGNOSTICS_ONLY === 'true';
exact('PRIVACY_DELETION_ENABLED', diagnosticsOnly ? 'false' : 'true');
exact('PRIVACY_VERIFICATION_PHONE_ENABLED', diagnosticsOnly ? 'false' : 'true');
exact('PRIVACY_VERIFICATION_EMAIL_ENABLED', 'false');
exact('PRIVACY_FULFILLMENT_ENABLED', 'false');
exact('PRIVACY_APPROVED_RETENTION_POLICY', 'SS-RETENTION-2026-10-23');
exact('PRIVACY_FISCAL_YEAR_END_MM_DD', '12-31');
exact('PRIVACY_COMPLETION_TIMEFRAME', 'Normally within 30 calendar days after verification; an ownership conflict or legal hold may require longer.');
exact('PRIVACY_ADMIN_USER_IDS', 'synthetic-isolated-admin');
exact('AUTO_DISPATCH_ENABLED', 'false');
exact('BND_MONITOR_ENABLED', 'false');
exact('AI_PRODUCT_WEB_LOOKUP_ENABLED', 'false');
exact('FIREBASE_SERVICE_ACCOUNT_JSON', '{}');

const databaseUrl = new URL(process.env.DATABASE_URL);
assert.equal(decodeURIComponent(databaseUrl.pathname), '/speedy_privacy_synthetic');
assert.notEqual(databaseUrl.hostname, 'localhost');
assert.notEqual(databaseUrl.hostname, '127.0.0.1');
assert.equal(process.env.PRIVACY_EXPECTED_DATABASE_HOST, databaseUrl.hostname);

const jwtSecret = secret('JWT_SECRET');
const digestSecret = secret('PRIVACY_DIGEST_KEY');
const controlSecret = secret('PRIVACY_ISOLATED_CONTROL_SECRET');
assert.equal(new Set([jwtSecret, digestSecret, controlSecret]).size, 3, 'isolated secrets must be distinct');
secret('TWILIO_ACCOUNT_SID');
secret('TWILIO_AUTH_TOKEN');
secret('TWILIO_VERIFY_SERVICE_SID');

for (const name of [
  'RESEND_API_KEY', 'PRIVACY_VERIFICATION_FROM', 'BND_LOGIN_EMAIL', 'BND_LOGIN_PASSWORD',
  'OPENAI_API_KEY', 'GOOGLE_PLACES_API_KEY', 'GOOGLE_GEOCODING_API_KEY', 'GOOGLE_ROUTES_API_KEY',
  'UNDISPATCHED_ALERT_EMAIL', 'UNDISPATCHED_ALERT_FROM'
]) absent(name);

const { prisma } = require('../dist/lib/prisma');
const { privacyRouter } = require('../dist/routes/privacy.routes');
const { signAuthToken } = require('../dist/utils/jwt');

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
if (!diagnosticsOnly) app.get(ISOLATED_ROUTES.preflight, authorize, (_req, res) => {
  res.json({
    ready: true,
    fixtureCreated: Boolean(fixture),
    phoneVerificationEnabled: process.env.PRIVACY_VERIFICATION_PHONE_ENABLED === 'true',
    emailVerificationEnabled: process.env.PRIVACY_VERIFICATION_EMAIL_ENABLED === 'true',
    fulfillmentEnabled: process.env.PRIVACY_FULFILLMENT_ENABLED === 'true'
  });
});

if (!diagnosticsOnly) app.post(ISOLATED_ROUTES.fixture, authorize, async (req, res) => {
  if (fixture) { res.status(409).json({ code: 'FIXTURE_ALREADY_CREATED' }); return; }
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.replace(/\D/g, '') : '';
  if (!/^1[2-9]\d{9}$/.test(phone)) { res.status(400).json({ code: 'CANADIAN_E164_PHONE_REQUIRED' }); return; }
  const localPhone = phone.slice(1);
  const trackingToken = randomBytes(32).toString('base64url');
  const { customer, order } = await prisma.$transaction(async tx => {
    const customer = await tx.customer.create({ data: {
      fullName: 'Synthetic Isolated Customer', normalizedFullName: 'synthetic isolated customer',
      phone: localPhone, normalizedPhone: localPhone, email: null, normalizedEmail: null,
      addressLine1: '93 Synthetic Street', city: 'Guelph', province: 'ON'
    } });
    const order = await tx.order.create({ data: {
      customerId: customer.id, customerName: customer.fullName, phone: localPhone, email: '',
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
  res.json({ trackingToken, adminToken });
});

if (!diagnosticsOnly) app.get(ISOLATED_ROUTES.unchanged, authorize, async (_req, res) => {
  if (!fixture) { res.status(404).json({ code: 'FIXTURE_NOT_CREATED' }); return; }
  const [customer, order] = await Promise.all([
    prisma.customer.findUnique({ where: { id: fixture.customerId }, select: { id: true } }),
    prisma.order.findUnique({ where: { id: fixture.orderId }, select: { privacyErasedAt: true } })
  ]);
  res.json({ customerPresent: !!customer, orderErased: !!order?.privacyErasedAt });
});

if (!diagnosticsOnly) app.use('/api/v1/privacy/deletion', privacyRouter());

(async () => {
  if (diagnosticsOnly) {
    const diagnostic = await collectTwilioDiagnostics({
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      serviceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
      after: process.env.PRIVACY_ISOLATED_DIAGNOSTIC_AFTER,
      before: process.env.PRIVACY_ISOLATED_DIAGNOSTIC_BEFORE
    });
    console.log(`[privacy-isolated] twilio diagnostic ${JSON.stringify(diagnostic)}`);
  } else {
    const [customers, orders, users] = await Promise.all([
      prisma.customer.count(), prisma.order.count(), prisma.user.count()
    ]);
    assert.deepEqual({ customers, orders, users }, { customers: 0, orders: 0, users: 0 },
      'the isolated database must be empty before the single-use server starts');
  }
  const port = Number(process.env.PORT || 4000);
  app.listen(port, '0.0.0.0', () => console.log(diagnosticsOnly
    ? `[privacy-isolated] ready on port ${port}; diagnostics only, messaging routes absent`
    : `[privacy-isolated] ready on port ${port}; no fixture or message created`));
})().catch(async error => {
  console.error(`[privacy-isolated] startup refused: ${error.message}`);
  await prisma.$disconnect();
  process.exitCode = 1;
});
