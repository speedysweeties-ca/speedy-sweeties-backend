process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/unused';
process.env.JWT_SECRET = 'synthetic-privacy-test-key';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ADOPTED_FISCAL_YEAR_END_MM_DD,
  PrivacyDeletionService,
  ADOPTED_REQUEST_AUDIT_REVIEW_MONTHS,
  ADOPTED_ANTI_REACTIVATION_REVIEW_MONTHS,
  addCalendarMonths,
  retainedFinancialFields
} = require('../dist/services/privacyDeletion.service');

const service = new PrivacyDeletionService(
  {},
  'synthetic-privacy-test-key',
  {},
  () => true,
  'synthetic timeframe',
  ADOPTED_FISCAL_YEAR_END_MM_DD
);

const decision = (overrides = {}) => ({
  policyReference: 'SYNTHETIC-TEST-ONLY',
  justification: 'Synthetic financial-retention calculation test only.',
  taxYearEnd: '2026-12-31',
  financialRetainUntil: '2032-12-31T23:59:59.999Z',
  personalFields: [],
  financialFields: [...retainedFinancialFields],
  unlinkedRecordsReviewed: true,
  confirmed: true,
  ...overrides
});

test('approved review periods are calendar-month calculations, not automatic deletion dates', () => {
  assert.equal(ADOPTED_REQUEST_AUDIT_REVIEW_MONTHS, 24);
  assert.equal(ADOPTED_ANTI_REACTIVATION_REVIEW_MONTHS, 24);
  assert.equal(addCalendarMonths(new Date('2028-02-29T15:30:00.000Z'), 24).toISOString(), '2030-02-28T15:30:00.000Z');
});

test('approved fiscal year-end is December 31 and expiry is six years after that tax-year end', () => {
  assert.equal(ADOPTED_FISCAL_YEAR_END_MM_DD, '12-31');
  assert.doesNotThrow(() => service.validateFinancialExpiry(
    [{ createdAt: new Date('2026-01-02T12:00:00.000Z') }],
    decision()
  ));
  assert.throws(() => service.validateFinancialExpiry(
    [{ createdAt: new Date('2026-01-02T12:00:00.000Z') }],
    decision({ financialRetainUntil: '2032-12-30T23:59:59.999Z' })
  ), /FINANCIAL_RETENTION_TOO_SHORT/);
});

test('deletion-request dates cannot substitute for the affected order tax-year end', () => {
  assert.throws(() => service.validateFinancialExpiry(
    [{ createdAt: new Date('2026-01-02T12:00:00.000Z') }],
    decision({ taxYearEnd: '2026-10-23', financialRetainUntil: '2032-10-23T23:59:59.999Z' })
  ), /INVALID_TAX_YEAR_END/);
  assert.doesNotThrow(() => service.validateFinancialExpiry(
    [{ createdAt: new Date('2025-11-30T12:00:00.000Z') }],
    decision({ taxYearEnd: '2025-12-31', financialRetainUntil: '2033-12-31T23:59:59.999Z' })
  ));
});
