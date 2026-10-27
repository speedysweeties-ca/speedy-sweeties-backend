const safeNumber = value => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
};

const safeRequest = async (url, authorization, fetcher) => {
  try {
    const response = await fetcher(url, {
      method: 'GET', headers: { authorization }, signal: AbortSignal.timeout(10_000)
    });
    const payload = await response.json().catch(() => ({}));
    return {
      httpStatus: response.status,
      errorCode: response.ok ? undefined : safeNumber(payload?.code),
      payload: response.ok && payload && typeof payload === 'object' ? payload : {}
    };
  } catch (error) {
    return { outcome: error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network_error' };
  }
};

const parseWindow = (afterValue, beforeValue) => {
  const after = new Date(afterValue);
  const before = new Date(beforeValue);
  if (!Number.isFinite(after.valueOf()) || !Number.isFinite(before.valueOf()) || before <= after || before - after > 15 * 60_000) {
    throw new Error('diagnostic window must be a valid interval of 15 minutes or less');
  }
  return { after: after.toISOString(), before: before.toISOString() };
};

const collectTwilioDiagnostics = async ({ accountSid, authToken, serviceSid, after, before, fetcher = fetch }) => {
  const window = parseWindow(after, before);
  const authorization = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
  const accountUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`;
  const serviceUrl = `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}`;
  const attemptsUrl = new URL('https://verify.twilio.com/v2/Attempts');
  attemptsUrl.searchParams.set('DateCreatedAfter', window.after);
  attemptsUrl.searchParams.set('DateCreatedBefore', window.before);
  attemptsUrl.searchParams.set('PageSize', '50');
  const alertsUrl = new URL('https://monitor.twilio.com/v1/Alerts');
  alertsUrl.searchParams.set('StartDate', window.after);
  alertsUrl.searchParams.set('EndDate', window.before);
  alertsUrl.searchParams.set('PageSize', '50');

  const accountResult = await safeRequest(accountUrl, authorization, fetcher);
  const serviceResult = await safeRequest(serviceUrl, authorization, fetcher);
  const attemptsResult = await safeRequest(attemptsUrl, authorization, fetcher);
  const alertsResult = await safeRequest(alertsUrl, authorization, fetcher);

  const attempts = Array.isArray(attemptsResult.payload?.attempts)
    ? attemptsResult.payload.attempts.filter(value => value?.service_sid === serviceSid && value?.channel === 'sms')
    : [];
  const alerts = Array.isArray(alertsResult.payload?.alerts)
    ? alertsResult.payload.alerts.filter(value => value?.service_sid === serviceSid ||
      (typeof value?.request_url === 'string' && value.request_url.includes(`/Services/${serviceSid}/Verifications`)))
    : [];

  const alertDetails = [];
  for (const alert of alerts.slice(0, 10)) {
    if (typeof alert.sid !== 'string' || !/^NO[0-9a-fA-F]{32}$/.test(alert.sid)) continue;
    const detail = await safeRequest(`https://monitor.twilio.com/v1/Alerts/${alert.sid}`, authorization, fetcher);
    let providerBody = {};
    if (typeof detail.payload?.response_body === 'string') {
      try { providerBody = JSON.parse(detail.payload.response_body); } catch { providerBody = {}; }
    }
    alertDetails.push({
      dateGenerated: typeof alert.date_generated === 'string' ? alert.date_generated : undefined,
      logLevel: typeof alert.log_level === 'string' ? alert.log_level : undefined,
      errorCode: safeNumber(alert.error_code),
      providerHttpStatus: safeNumber(providerBody.status),
      providerErrorCode: safeNumber(providerBody.code)
    });
  }

  const requestSummary = result => ({
    ...(result.httpStatus === undefined ? {} : { httpStatus: result.httpStatus }),
    ...(result.errorCode === undefined ? {} : { errorCode: result.errorCode }),
    ...(result.outcome === undefined ? {} : { outcome: result.outcome })
  });
  return {
    window,
    account: {
      ...requestSummary(accountResult),
      authenticated: accountResult.httpStatus === 200,
      sidMatches: accountResult.payload?.sid === accountSid,
      status: ['active', 'suspended', 'closed'].includes(accountResult.payload?.status) ? accountResult.payload.status : undefined,
      type: ['Trial', 'Full'].includes(accountResult.payload?.type) ? accountResult.payload.type : undefined
    },
    service: {
      ...requestSummary(serviceResult),
      accessible: serviceResult.httpStatus === 200,
      sidMatches: serviceResult.payload?.sid === serviceSid,
      ownerMatchesAccount: serviceResult.payload?.account_sid === accountSid
    },
    attempts: {
      ...requestSummary(attemptsResult),
      count: attempts.length,
      records: attempts.map(value => ({
        dateCreated: typeof value.date_created === 'string' ? value.date_created : undefined,
        country: typeof value.channel_data?.country === 'string' ? value.channel_data.country : undefined,
        messageStatus: typeof value.channel_data?.message_status === 'string' ? value.channel_data.message_status : undefined,
        errorCode: safeNumber(value.channel_data?.error_code),
        verificationAccepted: typeof value.verification_sid === 'string' && /^VE[0-9a-fA-F]{32}$/.test(value.verification_sid)
      }))
    },
    alerts: { ...requestSummary(alertsResult), count: alerts.length, records: alertDetails }
  };
};

module.exports = { collectTwilioDiagnostics, parseWindow };
