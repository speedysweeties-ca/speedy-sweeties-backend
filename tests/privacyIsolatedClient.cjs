// Interactive single-attempt client. Sensitive inputs are never accepted as arguments or printed.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const readline = require('node:readline');

const ask = label => new Promise(resolve => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl.question(label, answer => { rl.close(); resolve(answer.trim()); });
});

const askHidden = (label, input = process.stdin, output = process.stdout) => new Promise((resolve, reject) => {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    reject(new Error('An interactive terminal is required for private input'));
    return;
  }

  const wasRaw = Boolean(input.isRaw);
  let value = '';
  let settled = false;
  const finish = (error) => {
    if (settled) return;
    settled = true;
    input.removeListener('data', onData);
    input.setRawMode(wasRaw);
    input.pause();
    output.write('\n');
    if (error) reject(error);
    else resolve(value.trim());
  };
  const onData = chunk => {
    const text = chunk.toString('utf8').replace(/\u001b\[(?:200|201)~/g, '');
    for (const character of text) {
      if (character === '\u0003') { finish(new Error('Private input cancelled')); return; }
      if (character === '\r' || character === '\n') { finish(); return; }
      if (character === '\b' || character === '\u007f') {
        value = Array.from(value).slice(0, -1).join('');
        continue;
      }
      if (character >= ' ' && character !== '\u007f') value += character;
    }
  };

  input.setRawMode(true);
  input.resume();
  input.on('data', onData);
  output.write(label);
});

const normalizeCanadianPhone = input => {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return /^[2-9]\d{9}$/.test(digits) ? `+1${digits}` : null;
};

const askCanadianPhone = async (input = process.stdin, output = process.stdout) => {
  while (true) {
    const phone = normalizeCanadianPhone(await askHidden(
      'Robert-controlled Canadian mobile (10 digits, hidden): ', input, output
    ));
    if (phone) return phone;
    output.write('Invalid Canadian phone format. Enter 10 digits, optionally prefixed by +1. Nothing was sent.\n');
  }
};
const json = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Controlled test stopped: HTTP ${response.status}, code ${body.code || 'UNKNOWN'}`);
  return body;
};
const post = (url, body, token) => json(url, {
  method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body)
});

const run = async () => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('An interactive terminal is required');
  const baseInput = await ask('Isolated HTTPS service URL: ');
  const base = new URL(baseInput);
  assert.equal(base.protocol, 'https:', 'The isolated endpoint must use HTTPS');
  base.pathname = base.pathname.replace(/\/$/, '');
  const control = await askHidden('Isolated control secret (hidden): ');
  const phone = await askCanadianPhone();
  const fixture = await post(new URL('/__privacy_test/fixture', base), { phone }, control);
  const authorization = await ask(`Authorize exactly one Twilio Verify SMS to ••• ••• ${phone.slice(-4)} by typing SEND ONE SMS: `);
  if (authorization !== 'SEND ONE SMS') throw new Error('Authorization not provided; no SMS was sent');

  // There is intentionally no retry loop. A transport ambiguity stops the run.
  const route = path => new URL(`/api/v1/privacy/deletion${path}`, base);
  const challenge = await post(route('/challenges'), { trackingToken: fixture.trackingToken });
  assert.equal(challenge.channel, 'PHONE');
  assert.equal(challenge.maskedDestination.slice(-4), phone.slice(-4));
  console.log(`One SMS request accepted for ${challenge.maskedDestination}. No resend will occur.`);
  const code = await askHidden('Enter the received OTP once (hidden): ');
  if (!/^\d{4,10}$/.test(code)) throw new Error('OTP must contain 4 to 10 digits; the entered value was not retained or sent');
  const accessToken = randomBytes(32).toString('hex');
  const verified = await post(route(`/challenges/${challenge.challengeId}/verify`), { code, accessToken });
  const requestId = randomUUID();
  const requestToken = randomBytes(32).toString('hex');
  const submitted = await post(route('/requests'), {
    id: requestId, token: requestToken, challengeId: challenge.challengeId, proof: verified.proof
  }, accessToken);
  const status = await json(route(`/requests/${requestId}`), { headers: { authorization: `Bearer ${requestToken}` } });
  const preview = await json(route(`/admin/requests/${requestId}/preview`), {
    headers: { authorization: `Bearer ${fixture.adminToken}` }
  });
  const year = new Date().getUTCFullYear();
  const financialFields = [
    'recordIds', 'orderNumber', 'createdAt', 'updatedAt', 'paymentMethod', 'orderStatus',
    'itemDescription', 'quantity', 'price', 'receiptNumber', 'itemTotal', 'deliveryCharge',
    'taxOrFees', 'grandTotal', 'receiptChargeEvidence'
  ];
  const disabled = await fetch(route(`/admin/requests/${requestId}/fulfill`), {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${fixture.adminToken}` },
    body: JSON.stringify({ version: preview.version, previewHash: preview.previewHash, decision: {
      policyReference: 'SS-RETENTION-2026-10-23',
      justification: 'Synthetic isolated verification; fulfillment must remain disabled.',
      taxYearEnd: `${year}-12-31`, financialRetainUntil: `${year + 6}-12-31T23:59:59.999Z`,
      personalFields: [], financialFields, unlinkedRecordsReviewed: true, confirmed: true
    } })
  });
  const disabledBody = await disabled.json();
  assert.equal(disabled.status, 503);
  assert.equal(disabledBody.code, 'FULFILLMENT_DISABLED');
  const unchanged = await json(new URL('/__privacy_test/unchanged', base), {
    headers: { authorization: `Bearer ${control}` }
  });
  assert.deepEqual(unchanged, { customerPresent: true, orderErased: false });
  const cancelled = await post(route(`/requests/${requestId}/cancel`), {}, requestToken);
  assert.equal(cancelled.status, 'CANCELLED');
  console.log(JSON.stringify({
    smsAttempts: 1, verificationApproved: true, sourceOrderBound: preview.orderCount === 1,
    requestStatus: status.status, dueAtRecorded: !!submitted.dueAt,
    fulfillmentRejected: true, recordsUnchanged: true, finalStatus: cancelled.status
  }, null, 2));
};

if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { askHidden, normalizeCanadianPhone, askCanadianPhone };
