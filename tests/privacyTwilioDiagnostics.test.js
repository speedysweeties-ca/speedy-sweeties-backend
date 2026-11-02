const test = require('node:test');
const assert = require('node:assert/strict');
const { collectTwilioDiagnostics, parseWindow } = require('./privacyTwilioDiagnostics.cjs');

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' }
});

test('Twilio diagnostics report ownership, accepted attempt and safe provider error only', async () => {
  const accountSid = `AC${'a'.repeat(32)}`;
  const serviceSid = `VA${'b'.repeat(32)}`;
  const alertSid = `NO${'c'.repeat(32)}`;
  const privatePhone = '+15195550100';
  const fetcher = async urlValue => {
    const url = String(urlValue);
    if (url.includes('/Accounts/')) return json({ sid: accountSid, status: 'active', type: 'Full', auth_token: 'must-not-escape' });
    if (url.includes(`/Services/${serviceSid}`)) return json({ sid: serviceSid, account_sid: accountSid, friendly_name: 'private' });
    if (url.includes('/Attempts')) return json({ attempts: [{
      account_sid: accountSid, service_sid: serviceSid, verification_sid: `VE${'d'.repeat(32)}`,
      channel: 'sms', date_created: '2026-10-24T13:19:29Z',
      channel_data: { to: privatePhone, country: 'CA', message_status: 'undelivered', error_code: '30008' }
    }] });
    if (url.endsWith(`/Alerts/${alertSid}`)) return json({ response_body: JSON.stringify({ status: 400, code: 60238, message: privatePhone }) });
    if (url.includes('/Alerts')) return json({ alerts: [{
      sid: alertSid, service_sid: serviceSid, date_generated: '2026-10-24T13:19:29Z',
      log_level: 'error', error_code: '60238', request_url: `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`
    }] });
    throw new Error('unexpected URL');
  };
  const result = await collectTwilioDiagnostics({
    accountSid, authToken: 'private-token', serviceSid,
    after: '2026-10-24T13:17:00Z', before: '2026-10-24T13:22:00Z', fetcher
  });
  assert.deepEqual(result.account, { httpStatus: 200, authenticated: true, sidMatches: true, status: 'active', type: 'Full' });
  assert.deepEqual(result.service, { httpStatus: 200, accessible: true, sidMatches: true, ownerMatchesAccount: true });
  assert.deepEqual(result.attempts.records, [{
    dateCreated: '2026-10-24T13:19:29Z', country: 'CA', messageStatus: 'undelivered',
    errorCode: 30008, verificationAccepted: true
  }]);
  assert.equal(result.alerts.records[0].providerHttpStatus, 400);
  assert.equal(result.alerts.records[0].providerErrorCode, 60238);
  assert.doesNotMatch(JSON.stringify(result), /15195550100|private-token|must-not-escape|friendly_name/);
});

test('Twilio diagnostics sanitize authentication failures and reject broad windows', async () => {
  const result = await collectTwilioDiagnostics({
    accountSid: `AC${'a'.repeat(32)}`, authToken: 'private-token', serviceSid: `VA${'b'.repeat(32)}`,
    after: '2026-10-24T13:17:00Z', before: '2026-10-24T13:22:00Z',
    fetcher: async () => json({ status: 401, code: 20003, message: 'private credential details' }, 401)
  });
  assert.equal(result.account.httpStatus, 401);
  assert.equal(result.account.errorCode, 20003);
  assert.equal(result.account.authenticated, false);
  assert.doesNotMatch(JSON.stringify(result), /private credential details|private-token/);
  assert.throws(() => parseWindow('2026-10-24T13:00:00Z', '2026-10-24T14:00:00Z'), /15 minutes/);
});
