const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { inspectSyntheticFixture } = require('./privacyRenderReset.cjs');

const CHANNELS = new Set(['PHONE', 'EMAIL']);
const APPROVED_OWNER_EMAIL_SHA256 = 'e2c649d07d715206188f969bbec2abb1af77499af3898be92f096ce341797e47';
const REQUIRED_STARTUP_TABLES = Object.freeze([
  'StaffSessionEvent', 'User', 'DispatcherNote', 'DispatcherNoteRead', 'Customer',
  'RetentionMessage', 'ItemCatalog', 'Order', 'DigitalReceipt', 'PrivacyChallenge',
  'PrivacyDeletionRequest', 'PrivacyAccessCredential', 'PrivacyAudit',
  'PrivacyExternalTask', 'PrivacyDeletedIdentity', 'DeliveryHelpRequest',
  'DeliveryCheckInEvent', 'DispatchEvent', 'OrderItem', 'QrScan',
  'DispatcherChecklistItem', 'DispatcherChecklistCompletion',
  'DispatcherChecklistAlertLog', 'BndEmailAlert', 'BndMonitorCheck',
  'BndWaitingPeriod', 'SystemSetting', 'PickupLocation', 'OrderPickupStop',
  'OrderEditPause'
]);
const STARTUP_FAILURE_CATEGORIES = new Set([
  'DIAGNOSTIC', 'DATABASE_AUDIT', 'RECOVERY_SETUP', 'LISTENER', 'LOOPBACK_PREFLIGHT'
]);

const isolatedChannel = env => {
  const channel = env.PRIVACY_ISOLATED_CHANNEL;
  assert.ok(CHANNELS.has(channel), 'PRIVACY_ISOLATED_CHANNEL must be exactly PHONE or EMAIL');
  return channel;
};

const normalizeCanadianPhone = value => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return /^[2-9]\d{9}$/.test(digits) ? digits : null;
};

const normalizeEmail = value => {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}$/.test(email) ? email : null;
};

const approvedOwnerEmail = value => {
  const email = normalizeEmail(value);
  return !!email && createHash('sha256').update(email).digest('hex') === APPROVED_OWNER_EMAIL_SHA256;
};

const maskEmail = value => {
  const email = normalizeEmail(value);
  assert.ok(email, 'VALID_OWNER_EMAIL_REQUIRED');
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
};

const bounded = (value, max) => {
  const clean = String(value || '').trim();
  return clean && clean.length <= max ? clean : null;
};

const validateFixtureInput = (body, channel) => {
  const phone = normalizeCanadianPhone(body?.phone);
  assert.ok(phone, 'VALID_OWNER_PHONE_REQUIRED');
  if (channel === 'PHONE') return {
    fullName: 'Synthetic Isolated Customer', phone, email: null,
    addressLine1: '93 Synthetic Street', unitNumber: null, buzzCode: null,
  };
  const fixture = {
    fullName: bounded(body?.fullName, 100),
    phone,
    email: normalizeEmail(body?.email),
    addressLine1: bounded(body?.addressLine1, 200),
    unitNumber: bounded(body?.unitNumber, 50),
    buzzCode: bounded(body?.buzzCode, 50),
  };
  assert.ok(fixture.fullName, 'VALID_SYNTHETIC_NAME_REQUIRED');
  assert.ok(fixture.email, 'VALID_OWNER_EMAIL_REQUIRED');
  assert.ok(approvedOwnerEmail(fixture.email), 'APPROVED_OWNER_EMAIL_REQUIRED');
  assert.ok(fixture.addressLine1, 'VALID_GUELPH_ADDRESS_REQUIRED');
  return fixture;
};

const quoteIdentifier = identifier => `"${identifier.replaceAll('"', '""')}"`;

const auditFullApplicationTableState = async prisma => {
  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const tableSet = new Set(tables.map(row => row.table_name));
  const missing = REQUIRED_STARTUP_TABLES.filter(table => !tableSet.has(table));
  assert.deepEqual(missing, [], 'ISOLATED_DATABASE_SCHEMA_INCOMPLETE');
  const audit = await inspectSyntheticFixture(prisma, tableSet, quoteIdentifier);
  assert.equal(audit.state, 'empty', 'ISOLATED_DATABASE_NOT_EMPTY');
  return { state: 'empty', tableCount: tableSet.size };
};

const sanitizedStartupFailure = stage => ({
  check: 'SPEEDY_PRIVACY_ISOLATED_STARTUP',
  result: 'REFUSED',
  category: STARTUP_FAILURE_CATEGORIES.has(stage) ? stage : 'STARTUP'
});

module.exports = {
  APPROVED_OWNER_EMAIL_SHA256,
  REQUIRED_STARTUP_TABLES,
  isolatedChannel,
  normalizeCanadianPhone,
  normalizeEmail,
  approvedOwnerEmail,
  maskEmail,
  validateFixtureInput,
  auditFullApplicationTableState,
  sanitizedStartupFailure
};
