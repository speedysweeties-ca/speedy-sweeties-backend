process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/unused';
process.env.JWT_SECRET = 'synthetic-privacy-test-key';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ADOPTED_FISCAL_YEAR_END_MM_DD,
  PrivacyDeletionService,
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
  requestRetainUntil: '2030-01-01T00:00:00.000Z',
  suppressionReviewAt: '2030-01-01T00:00:00.000Z',
  personalFields: [],
  financialFields: [...retainedFinancialFields],
  unlinkedRecordsReviewed: true,
  confirmed: true,
  ...overrides
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
