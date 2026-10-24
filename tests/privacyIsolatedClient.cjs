// Interactive single-attempt client. Sensitive inputs are never accepted as arguments or printed.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const readline = require('node:readline');

if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('An interactive terminal is required');
const ask = (label, hidden = false) => new Promise(resolve => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    rl._writeToOutput = function(value) {
      if (value.includes(label) || value === '\n' || value === '\r\n') this.output.write(value);
    };
  }
  rl.question(label, answer => { rl.close(); resolve(answer.trim()); });
});
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

(async () => {
  const baseInput = await ask('Isolated HTTPS service URL: ');
  const base = new URL(baseInput);
  assert.equal(base.protocol, 'https:', 'The isolated endpoint must use HTTPS');
  base.pathname = base.pathname.replace(/\/$/, '');
  const control = await ask('Isolated control secret (hidden): ', true);
  const phone = (await ask('Robert-controlled Canadian mobile in +1 format (hidden): ', true)).replace(/\D/g, '');
  assert.match(phone, /^1[2-9]\d{9}$/);
  const fixture = await post(new URL('/__privacy_test/fixture', base), { phone: `+${phone}` }, control);
  const authorization = await ask(`Authorize exactly one Twilio Verify SMS to ••• ••• ${phone.slice(-4)} by typing SEND ONE SMS: `);
  assert.equal(authorization, 'SEND ONE SMS', 'No SMS was sent');

  // There is intentionally no retry loop. A transport ambiguity stops the run.
  const route = path => new URL(`/api/v1/privacy/deletion${path}`, base);
  const challenge = await post(route('/challenges'), { trackingToken: fixture.trackingToken });
  assert.equal(challenge.channel, 'PHONE');
  assert.equal(challenge.maskedDestination.slice(-4), phone.slice(-4));
  console.log(`One SMS request accepted for ${challenge.maskedDestination}. No resend will occur.`);
  const code = await ask('Enter the received OTP once (hidden): ', true);
  assert.match(code, /^\d{4,10}$/);
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
})().catch(error => { console.error(error.message); process.exitCode = 1; });
