const assert = require('node:assert/strict');

const CHANNELS = new Set(['PHONE', 'EMAIL']);

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
  assert.ok(fixture.addressLine1, 'VALID_GUELPH_ADDRESS_REQUIRED');
  return fixture;
};

module.exports = { isolatedChannel, normalizeCanadianPhone, normalizeEmail, validateFixtureInput };
