// Prepares one isolated EMAIL fixture. It does not request or send a message.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { askHidden, isolatedPreflight } = require('./privacyIsolatedClient.cjs');
const {
  normalizeCanadianPhone, normalizeEmail, approvedOwnerEmail, maskEmail
} = require('./privacyIsolatedEmailSupport.cjs');
const { ISOLATED_ROUTES } = require('./privacyIsolatedContract.cjs');

const ALLOWED_ORIGIN = 'https://speedy-privacy-isolated.onrender.com';
const recordPath = () => path.join(os.homedir(), 'Library', 'Application Support',
  'SpeedyPrivacyTest', 'isolated-email-fixture.json');

const ask = label => new Promise(resolve => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl.question(label, answer => { rl.close(); resolve(answer.trim()); });
});

const allowedBase = value => {
  const url = new URL(value);
  assert.equal(url.origin, ALLOWED_ORIGIN, 'Only the exact isolated HTTPS origin is allowed');
  assert.equal(url.username, ''); assert.equal(url.password, '');
  assert.ok(url.pathname === '/' || url.pathname === '', 'The isolated origin must not contain a path');
  assert.equal(url.search, ''); assert.equal(url.hash, '');
  return new URL(ALLOWED_ORIGIN);
};

const post = async (url, body, token, fetchImpl = fetch) => {
  const response = await fetchImpl(url, {
    method: 'POST', signal: AbortSignal.timeout(10_000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Fixture preparation stopped: HTTP ${response.status}, code ${payload.code || 'UNKNOWN'}`);
    error.code = payload.code || 'UNKNOWN'; throw error;
  }
  return payload;
};

const saveProtectedRecord = (record, target = recordPath()) => {
  assert.equal(typeof record.baseURL, 'string');
  for (const key of ['controlSecret', 'trackingToken', 'adminToken', 'orderId', 'maskedDestination']) {
    assert.ok(typeof record[key] === 'string' && record[key].length > 0, `Missing ${key}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const directoryMode = fs.statSync(path.dirname(target)).mode & 0o777;
  assert.equal(directoryMode & 0o077, 0, 'Protected directory must not be accessible to group/others');
  const handle = fs.openSync(target, 'wx', 0o600);
  try { fs.writeFileSync(handle, JSON.stringify(record)); }
  finally { fs.closeSync(handle); }
  assert.equal(fs.statSync(target).mode & 0o077, 0, 'Protected record must be mode 0600');
  return target;
};

const run = async () => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('An interactive terminal is required');
  const base = allowedBase(await ask(`Exact isolated service origin (${ALLOWED_ORIGIN}): `));
  const controlSecret = await askHidden('Isolated control secret (hidden): ');
  const preflight = await isolatedPreflight(base, controlSecret);
  assert.deepEqual(preflight, {
    ready: true, fixtureCreated: false, verificationChannel: 'EMAIL',
    phoneVerificationEnabled: false, emailVerificationEnabled: true, fulfillmentEnabled: false
  }, 'The isolated service is not in the approved email pre-fixture state');

  const fullName = await askHidden('Synthetic display name (hidden): ');
  const email = normalizeEmail(await askHidden('Owner-controlled eligible email (hidden): '));
  const phone = normalizeCanadianPhone(await askHidden('Owner-controlled phone; no SMS (hidden): '));
  const addressLine1 = await askHidden('Routable Guelph address (hidden): ');
  const unitNumber = await askHidden('Optional unit; Enter for none (hidden): ');
  const buzzCode = await askHidden('Optional buzz code; Enter for none (hidden): ');
  assert.ok(email, 'Valid owner email required'); assert.ok(phone, 'Valid Canadian phone required');
  assert.ok(approvedOwnerEmail(email), 'Entered email does not match the approved owner mailbox');
  assert.ok(fullName.trim() && addressLine1.trim(), 'Synthetic name and address are required');
  const authorization = await ask('Type PREPARE ISOLATED FIXTURE (creates synthetic rows; sends no message): ');
  assert.equal(authorization, 'PREPARE ISOLATED FIXTURE', 'Fixture preparation was not authorized');
  const fixture = await post(new URL(ISOLATED_ROUTES.fixture, base), {
    fullName, email, phone, addressLine1, unitNumber, buzzCode
  }, controlSecret);
  const maskedDestination = maskEmail(email);
  assert.equal(fixture.maskedDestination, maskedDestination,
    'The isolated service did not confirm the approved masked destination');
  saveProtectedRecord({
    version: 1, channel: 'EMAIL', baseURL: base.origin, controlSecret,
    trackingToken: fixture.trackingToken, adminToken: fixture.adminToken,
    orderId: fixture.orderId, maskedDestination
  });
  console.log(JSON.stringify({ fixtureCreated: true, protectedRecordSaved: true,
    messagesSent: 0, emailVerificationEnabled: true, phoneVerificationEnabled: false }));
};

if (require.main === module) run().catch(error => {
  console.error(`Isolated fixture stopped: ${error.message}`); process.exitCode = 1;
});

module.exports = { ALLOWED_ORIGIN, allowedBase, post, recordPath, saveProtectedRecord };
