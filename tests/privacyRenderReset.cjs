const assert = require('node:assert/strict');

const EXPECTED_TIMEFRAME =
  'Normally within 30 calendar days after verification; an ownership conflict or legal hold may require longer.';
const EXPECTED_NONEMPTY = Object.freeze({
  Customer: 1,
  Order: 1,
  User: 1,
  PrivacyChallenge: 1,
});
const SYSTEM_TABLES = new Set(['_prisma_migrations']);
const HEX_64 = /^[a-f0-9]{64}$/;
const TWILIO_VERIFICATION_SID = /^VE[a-f0-9]{32}$/i;

function safeFixtureAssertion(condition, code) {
  assert.ok(condition, `Synthetic reset refused: ${code}`);
}

function validateSyntheticFixtureSnapshot(snapshot) {
  const counts = snapshot.counts;
  const applicationEntries = Object.entries(counts).filter(([table]) => !SYSTEM_TABLES.has(table));
  const totalRows = applicationEntries.reduce((sum, [, count]) => sum + count, 0);
  if (totalRows === 0) return 'empty';

  for (const [table, count] of applicationEntries) {
    safeFixtureAssertion(count === (EXPECTED_NONEMPTY[table] || 0), `unexpected rows in ${table}`);
  }
  for (const [table, count] of Object.entries(EXPECTED_NONEMPTY)) {
    safeFixtureAssertion(counts[table] === count, `missing expected ${table} fixture`);
  }

  const { customer, order, user, challenge } = snapshot;
  safeFixtureAssertion(customer?.fullName === 'Synthetic Isolated Customer', 'customer marker mismatch');
  safeFixtureAssertion(customer?.normalizedFullName === 'synthetic isolated customer', 'customer normalization mismatch');
  safeFixtureAssertion(customer?.addressLine1 === '93 Synthetic Street', 'customer address marker mismatch');
  safeFixtureAssertion(customer?.city === 'Guelph' && customer?.province === 'ON', 'customer region marker mismatch');
  safeFixtureAssertion(customer?.email === null && customer?.normalizedEmail === null, 'customer email must be absent');
  safeFixtureAssertion(/^[2-9]\d{9}$/.test(customer?.phone || ''), 'customer phone shape mismatch');
  safeFixtureAssertion(customer?.normalizedPhone === customer?.phone, 'customer phone normalization mismatch');

  safeFixtureAssertion(order?.customerId === customer?.id, 'order/customer binding mismatch');
  safeFixtureAssertion(order?.customerName === customer?.fullName, 'order customer marker mismatch');
  safeFixtureAssertion(order?.phone === customer?.phone && order?.email === '', 'order contact marker mismatch');
  safeFixtureAssertion(order?.addressLine1 === customer?.addressLine1, 'order address marker mismatch');
  safeFixtureAssertion(order?.itemsText === 'Synthetic isolated privacy fixture', 'order item marker mismatch');
  safeFixtureAssertion(order?.paymentMethod === 'CASH', 'order payment marker mismatch');
  safeFixtureAssertion(order?.orderSource === 'IOS_APP' && order?.orderStatus === 'DELIVERED', 'order state marker mismatch');
  safeFixtureAssertion(order?.privacyErasedAt === null, 'order must not be privacy-erased');
  safeFixtureAssertion(HEX_64.test(order?.trackingTokenHash || ''), 'order token marker mismatch');

  safeFixtureAssertion(user?.id === 'synthetic-isolated-admin', 'administrator ID marker mismatch');
  safeFixtureAssertion(user?.email === 'privacy-isolated-admin@example.invalid', 'administrator email marker mismatch');
  safeFixtureAssertion(user?.passwordHash === 'synthetic-not-a-login', 'administrator password marker mismatch');
  safeFixtureAssertion(user?.role === 'ADMIN', 'administrator role marker mismatch');
  safeFixtureAssertion(user?.firstName === 'Synthetic' && user?.lastName === 'Admin', 'administrator name marker mismatch');

  safeFixtureAssertion(challenge?.subjectId === customer?.id, 'challenge/customer binding mismatch');
  safeFixtureAssertion(challenge?.sourceOrderId === order?.id, 'challenge/order binding mismatch');
  safeFixtureAssertion(challenge?.accessId === null, 'challenge access state mismatch');
  safeFixtureAssertion(challenge?.purpose === 'ENROLL_DELETE', 'challenge purpose mismatch');
  safeFixtureAssertion(challenge?.channel === 'PHONE', 'challenge channel mismatch');
  safeFixtureAssertion(challenge?.destinationHash === challenge?.phoneHash, 'challenge destination marker mismatch');
  safeFixtureAssertion(HEX_64.test(challenge?.destinationHash || ''), 'challenge destination hash mismatch');
  safeFixtureAssertion(HEX_64.test(challenge?.requesterHash || ''), 'challenge requester hash mismatch');
  safeFixtureAssertion(HEX_64.test(challenge?.codeHash || ''), 'challenge code hash mismatch');
  safeFixtureAssertion(HEX_64.test(challenge?.contactFingerprint || ''), 'challenge contact marker mismatch');
  safeFixtureAssertion(challenge?.completionTimeframe === EXPECTED_TIMEFRAME, 'challenge timeframe mismatch');
  const rejectedBeforeAcceptance =
    challenge?.delivery === 'UNAVAILABLE' && challenge?.providerReference === null;
  const acceptedButUnverified =
    challenge?.delivery === 'SENT' &&
    TWILIO_VERIFICATION_SID.test(challenge?.providerReference || '');
  safeFixtureAssertion(
    rejectedBeforeAcceptance || acceptedButUnverified,
    'challenge provider/delivery state mismatch',
  );
  safeFixtureAssertion(challenge?.attempts === 0, 'challenge attempt state mismatch');
  safeFixtureAssertion(challenge?.verifiedAt === null && challenge?.consumedAt === null, 'challenge completion state mismatch');

  return 'synthetic-fixture';
}

async function inspectSyntheticFixture(prisma, tableSet, quoteIdentifier) {
  const counts = {};
  for (const table of tableSet) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)}`,
    );
    counts[table] = rows[0].count;
  }
  const applicationRows = Object.entries(counts)
    .filter(([table]) => !SYSTEM_TABLES.has(table))
    .reduce((sum, [, count]) => sum + count, 0);
  if (applicationRows === 0) return { state: 'empty', counts };

  const [customer, order, user, challenge] = await Promise.all([
    prisma.customer.findFirst(),
    prisma.order.findFirst(),
    prisma.user.findFirst(),
    prisma.privacyChallenge.findFirst(),
  ]);
  const state = validateSyntheticFixtureSnapshot({ counts, customer, order, user, challenge });
  return { state, counts };
}

async function assertAllApplicationTablesEmpty(prisma, tableSet, quoteIdentifier) {
  const nonempty = [];
  for (const table of tableSet) {
    if (SYSTEM_TABLES.has(table)) continue;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)}`,
    );
    if (rows[0].count !== 0) nonempty.push(table);
  }
  assert.deepEqual(nonempty, [], `Synthetic reset verification failed: nonempty tables: ${nonempty.join(', ')}`);
}

module.exports = {
  EXPECTED_NONEMPTY,
  validateSyntheticFixtureSnapshot,
  inspectSyntheticFixture,
  assertAllApplicationTablesEmpty,
};
