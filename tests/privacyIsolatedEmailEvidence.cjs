// Reads the protected isolated record and emits sanitized evidence only.
// It never requests verification, sends a message, cancels, fulfills or deletes data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { recordPath, ALLOWED_ORIGIN } = require('./privacyIsolatedEmailFixture.cjs');
const { ISOLATED_ROUTES } = require('./privacyIsolatedContract.cjs');

const loadProtectedRecord = (target = recordPath()) => {
  const stats = fs.statSync(target);
  assert.equal(stats.isFile(), true, 'Protected fixture record is unavailable');
  assert.equal(stats.mode & 0o077, 0, 'Protected fixture record permissions are too broad');
  const record = JSON.parse(fs.readFileSync(target, 'utf8'));
  assert.equal(record.version, 1); assert.equal(record.channel, 'EMAIL');
  assert.equal(record.baseURL, ALLOWED_ORIGIN);
  for (const key of ['controlSecret', 'adminToken', 'trackingToken', 'orderId']) {
    assert.ok(typeof record[key] === 'string' && record[key].length > 0, `Protected record is missing ${key}`);
  }
  return record;
};

const json = async (url, token, options = {}, fetchImpl = fetch) => {
  const response = await fetchImpl(url, {
    ...options,
    signal: AbortSignal.timeout(10_000),
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, payload };
};

const sanitizedOutcome = outcome => ({
  challengeCount: outcome.challengeCount,
  sentChallenges: outcome.sentChallenges,
  verifiedChallenges: outcome.verifiedChallenges,
  accessCount: outcome.accessCount,
  requestCount: outcome.requestCount,
  requestStatus: outcome.requestStatus,
  dueAtRecorded: outcome.dueAtRecorded,
  databaseErased: outcome.databaseErased,
  customerPresent: outcome.customerPresent,
  orderErased: outcome.orderErased
});

const assertFinalOutcome = outcome => {
  assert.deepEqual(sanitizedOutcome(outcome), {
    challengeCount: 1, sentChallenges: 1, verifiedChallenges: 1, accessCount: 1, requestCount: 1,
    requestStatus: 'CANCELLED', dueAtRecorded: true, databaseErased: false,
    customerPresent: true, orderErased: false
  }, 'The isolated email flow has not reached its approved final state');
  return {
    verificationApproved: true, durableAccessRecorded: true, sourceOrderBound: true,
    dueAtRecorded: true, fulfillmentRejected: true, recordsUnchanged: true,
    finalStatus: 'CANCELLED', messagesAuthorizedMaximum: 1
  };
};

const saveFulfillmentEvidence = (record, target = recordPath()) => {
  const temporary = `${target}.next`;
  const handle = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(handle, JSON.stringify({ ...record, fulfillmentRejected: true })); }
  finally { fs.closeSync(handle); }
  fs.renameSync(temporary, target);
  assert.equal(fs.statSync(target).mode & 0o077, 0);
};

const assertPreCancelOutcome = outcome => {
  assert.deepEqual(sanitizedOutcome(outcome), {
    challengeCount: 1, sentChallenges: 1, verifiedChallenges: 1, accessCount: 1, requestCount: 1,
    requestStatus: 'SUBMITTED', dueAtRecorded: true, databaseErased: false,
    customerPresent: true, orderErased: false
  }, 'The isolated email flow is not in the approved pre-cancel state');
};

const run = async () => {
  const record = loadProtectedRecord();
  const base = new URL(record.baseURL);
  const outcomeResult = await json(new URL(ISOLATED_ROUTES.outcome, base), record.controlSecret);
  assert.equal(outcomeResult.status, 200, 'Sanitized outcome is unavailable');
  if (outcomeResult.payload.requestStatus === 'SUBMITTED') {
    assertPreCancelOutcome(outcomeResult.payload);
    const route = path => new URL(`/api/v1/privacy/deletion${path}`, base);
    const preview = await json(route(`/admin/requests/${outcomeResult.payload.requestId}/preview`), record.adminToken);
    assert.equal(preview.status, 200, 'Synthetic preview is unavailable');
    const year = new Date().getUTCFullYear();
    const fulfillment = await json(route(`/admin/requests/${outcomeResult.payload.requestId}/fulfill`), record.adminToken, {
      method: 'POST', body: JSON.stringify({
        version: preview.payload.version, previewHash: preview.payload.previewHash,
        decision: {
          policyReference: 'SS-RETENTION-2026-10-23',
          justification: 'Synthetic isolated verification; fulfillment must remain disabled.',
          taxYearEnd: `${year}-12-31`, financialRetainUntil: `${year + 6}-12-31T23:59:59.999Z`,
          personalFields: [], financialFields: preview.payload.financialFields,
          unlinkedRecordsReviewed: true, confirmed: true
        }
      })
    });
    assert.equal(fulfillment.status, 503);
    assert.equal(fulfillment.payload.code, 'FULFILLMENT_DISABLED');
    const unchanged = await json(new URL(ISOLATED_ROUTES.unchanged, base), record.controlSecret);
    assert.equal(unchanged.status, 200);
    assert.deepEqual(unchanged.payload, { customerPresent: true, orderErased: false });
    saveFulfillmentEvidence(record);
    console.log(JSON.stringify({ check: 'SPEEDY_ISOLATED_EMAIL_PRE_CANCEL',
      oneEmailAccepted: true, verificationApproved: true, sourceOrderBound: preview.payload.orderCount === 1,
      dueAtRecorded: true, fulfillmentRejected: true, recordsUnchanged: true, pass: true }));
    return;
  }
  assert.equal(record.fulfillmentRejected, true, 'Pre-cancel fulfillment evidence is unavailable');
  const evidence = assertFinalOutcome(outcomeResult.payload);
  console.log(JSON.stringify({ check: 'SPEEDY_ISOLATED_EMAIL_FINAL', ...evidence, pass: true }));
};

if (require.main === module) run().catch(() => {
  console.error(JSON.stringify({ check: 'SPEEDY_ISOLATED_EMAIL_FINAL', pass: false }));
  process.exitCode = 1;
});

module.exports = { loadProtectedRecord, sanitizedOutcome, assertPreCancelOutcome, assertFinalOutcome };
