'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  materializePinnedBaselineSchema,
  applyPinnedBaselineAndPrivacyMigrations,
} = require('./privacyBaseline.cjs');
const { REQUIRED_STARTUP_TABLES } = require('./privacyIsolatedEmailSupport.cjs');
const { validateSyntheticFixtureSnapshot } = require('./privacyRenderReset.cjs');
const {
  COMPLETED_PHONE_CLEANUP_GATE,
  COMPLETED_PHONE_COUNTS,
  expectedMigrationEvidence,
  reviewedSourceReport,
  validateCompletedPhoneFixtureSnapshot,
  acquireWriterExclusion,
  triggerDefinitionReport,
  triggerFunctionDefinitionReport,
  migrationLedgerReport,
  runPrismaSchemaDiff,
  verifyEmptyCompatibleDatabase,
} = require('./privacyCompletedPhoneCleanup.cjs');
const {
  validateCleanupEnvironment,
  sanitizedFailure,
  runCompletedPhoneCleanup,
} = require('./prepareCompletedPhoneCleanup.cjs');

const authorizedEnvironment = () => ({
  NODE_ENV: 'test',
  PRIVACY_SYNTHETIC_DATABASE: 'yes',
  PRIVACY_ISOLATED_RENDER: 'yes',
  RENDER: 'true',
  RENDER_SERVICE_ID: 'srv-dbe3861srm7s73dgfe50',
  RENDER_SERVICE_NAME: 'speedy-privacy-isolated',
  PRIVACY_EXPECTED_DATABASE_RESOURCE_ID: 'dpg-dbe37v59fdbs73961o3g-a',
  PRIVACY_EXPECTED_DATABASE_HOST: 'dpg-dbe37v59fdbs73961o3g-a',
  DATABASE_URL: 'postgresql://speedy_privacy_synthetic_user:private@dpg-dbe37v59fdbs73961o3g-a/speedy_privacy_synthetic',
  PRIVACY_ISOLATED_CLEANUP: COMPLETED_PHONE_CLEANUP_GATE,
  PRIVACY_ISOLATED_WRITERS_EXCLUDED: 'confirmed',
  PRIVACY_ISOLATED_RESET: 'disabled',
  PRIVACY_ISOLATED_DIAGNOSTICS_ONLY: 'true',
  PRIVACY_DELETION_ENABLED: 'false',
  PRIVACY_VERIFICATION_PHONE_ENABLED: 'false',
  PRIVACY_VERIFICATION_EMAIL_ENABLED: 'false',
  PRIVACY_FULFILLMENT_ENABLED: 'false',
  RENDER_GIT_COMMIT: '53b83e90ac11011f51388eff17474dfc20afdeb7',
  PRIVACY_ISOLATED_CLEANUP_APPROVED_REVISION: '53b83e90ac11011f51388eff17474dfc20afdeb7',
});

const completedSnapshot = () => {
  const customer = {
    id: 'customer-id', fullName: 'Synthetic Isolated Customer',
    normalizedFullName: 'synthetic isolated customer', phone: '5195550123',
    normalizedPhone: '5195550123', email: null, normalizedEmail: null,
    addressLine1: '93 Synthetic Street', city: 'Guelph', province: 'ON',
  };
  const order = {
    id: 'order-id', customerId: customer.id, customerName: customer.fullName,
    phone: customer.phone, email: '', addressLine1: customer.addressLine1,
    itemsText: 'Synthetic isolated privacy fixture', paymentMethod: 'CASH',
    orderSource: 'IOS_APP', orderStatus: 'DELIVERED', privacyErasedAt: null,
    trackingTokenHash: 'a'.repeat(64),
  };
  const access = {
    id: 'access-id', customerId: customer.id, sourceOrderId: order.id, channel: 'PHONE',
    destinationHash: 'b'.repeat(64), revokedAt: null,
  };
  const challenge = {
    id: 'challenge-id', subjectId: customer.id, sourceOrderId: order.id, accessId: access.id,
    purpose: 'ENROLL_DELETE', channel: 'PHONE', destinationHash: access.destinationHash,
    phoneHash: access.destinationHash, requesterHash: 'c'.repeat(64), codeHash: 'd'.repeat(64),
    contactFingerprint: 'e'.repeat(64), providerReference: `VE${'f'.repeat(32)}`,
    completionTimeframe: 'Normally within 30 calendar days after verification; an ownership conflict or legal hold may require longer.',
    delivery: 'SENT', attempts: 1, verifiedAt: new Date('2026-10-26T16:51:00Z'),
    consumedAt: new Date('2026-10-26T16:52:00Z'),
  };
  const createdAt = new Date('2026-10-26T16:53:00Z');
  const closedAt = new Date('2026-10-26T16:55:00Z');
  const request = {
    id: 'request-id', subjectId: customer.id, sourceOrderId: order.id,
    challengeId: challenge.id, activeSubject: null, status: 'CANCELLED', version: 1,
    contactFingerprint: challenge.contactFingerprint,
    completionTimeframe: challenge.completionTimeframe,
    createdAt, dueAt: new Date(createdAt.getTime() + 30 * 86400000),
    databaseErasedAt: null, completedAt: null, closedAt,
    requestAuditReviewAt: new Date('2028-10-26T16:55:00Z'),
  };
  return {
    counts: { ...COMPLETED_PHONE_COUNTS },
    customers: [customer], orders: [order],
    users: [{
      id: 'synthetic-isolated-admin', email: 'privacy-isolated-admin@example.invalid',
      passwordHash: 'synthetic-not-a-login', role: 'ADMIN', firstName: 'Synthetic', lastName: 'Admin',
    }],
    challenges: [challenge], accessCredentials: [access], requests: [request],
    audits: [
      { requestId: request.id, event: 'SUBMITTED' },
      { requestId: request.id, event: 'CANCELLED' },
    ],
  };
};

const triggerRows = () => {
  const rows = [];
  const add = (trigger_name, event_object_table, events, fn) => {
    for (const event_manipulation of events) rows.push({
      trigger_name, event_object_table, action_timing: 'BEFORE', action_orientation: 'ROW',
      event_manipulation, action_statement: `EXECUTE FUNCTION ${fn}()`,
    });
  };
  add('privacy_retained_order_guard', 'Order', ['DELETE', 'UPDATE'], 'privacy_retained_order_guard');
  add('privacy_receipt_guard', 'DigitalReceipt', ['DELETE', 'INSERT', 'UPDATE'], 'privacy_retained_child_guard');
  add('privacy_item_guard', 'OrderItem', ['DELETE', 'INSERT', 'UPDATE'], 'privacy_retained_child_guard');
  add('privacy_help_guard', 'DeliveryHelpRequest', ['INSERT', 'UPDATE'], 'privacy_retained_child_guard');
  return rows;
};

const triggerFunctionRows = () => [{
  function_name: 'privacy_retained_order_guard', language_name: 'plpgsql', arguments: '',
  result_type: 'trigger', volatility: 'v', security_definer: false,
  source_body: `
    BEGIN
      IF OLD."privacyErasedAt" IS NOT NULL THEN
        RAISE EXCEPTION 'Retained privacy record is read only';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END
  `,
}, {
  function_name: 'privacy_retained_child_guard', language_name: 'plpgsql', arguments: '',
  result_type: 'trigger', volatility: 'v', security_definer: false,
  source_body: `
    BEGIN
      IF TG_OP = 'DELETE' THEN
        PERFORM id FROM "Order" WHERE id = OLD."orderId" AND "privacyErasedAt" IS NULL FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Retained privacy record is read only'; END IF;
        RETURN OLD;
      END IF;
      PERFORM id FROM "Order" WHERE id = NEW."orderId" AND "privacyErasedAt" IS NULL FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Retained privacy record is read only'; END IF;
      RETURN NEW;
    END
  `,
}];

test('reviewed cleanup inputs are pinned to the accepted schema and migration files', () => {
  assert.deepEqual(reviewedSourceReport(), { reviewedFileCount: 7, mismatches: [], pass: true });
  assert.equal(expectedMigrationEvidence().length, 5);
});

test('completed fixture validator accepts only the audited cancelled phone graph', () => {
  assert.deepEqual(validateCompletedPhoneFixtureSnapshot(completedSnapshot()), {
    state: COMPLETED_PHONE_CLEANUP_GATE, pass: true,
  });
  const privateValue = 'private-changed-value';
  for (const mutate of [
    value => { value.customers[0].fullName = privateValue; },
    value => { value.counts.DigitalReceipt = 1; },
    value => { value.accessCredentials[0].sourceOrderId = 'conflicting-order'; },
    value => { value.requests[0].status = 'SUBMITTED'; },
    value => { value.audits.push({ requestId: 'request-id', event: 'EXTRA' }); },
    value => { value.orders[0].privacyErasedAt = new Date(); },
  ]) {
    const value = completedSnapshot(); mutate(value);
    assert.throws(() => validateCompletedPhoneFixtureSnapshot(value), error => {
      assert.doesNotMatch(error.message, new RegExp(privateValue));
      assert.match(error.message, /^FIXTURE_/);
      return true;
    });
  }
});

test('legacy reset remains unable to accept the completed phone fixture', () => {
  const value = completedSnapshot();
  assert.throws(() => validateSyntheticFixtureSnapshot({
    counts: value.counts,
    customer: value.customers[0], order: value.orders[0], user: value.users[0],
    challenge: value.challenges[0],
  }), /Synthetic reset refused/);
});

test('cleanup target requires exact internal isolated identity and all writers and gates off', () => {
  assert.equal(validateCleanupEnvironment(authorizedEnvironment()).source.pass, true);
  for (const mutate of [
    env => { env.RENDER_SERVICE_ID = 'srv-d7ntlnpkh4rs73bev9q0'; },
    env => { env.PRIVACY_EXPECTED_DATABASE_RESOURCE_ID = 'dpg-d7m33g2qqhas73f58hrg-a'; },
    env => { env.DATABASE_URL = env.DATABASE_URL.replace('dpg-dbe37v59fdbs73961o3g-a', 'dpg-d7m33g2qqhas73f58hrg-a'); },
    env => { env.DATABASE_URL = env.DATABASE_URL.replace('dpg-dbe37v59fdbs73961o3g-a/', 'dpg-dbe37v59fdbs73961o3g-a.ohio-postgres.render.com/'); },
    env => { env.PRIVACY_ISOLATED_WRITERS_EXCLUDED = 'assumed'; },
    env => { env.PRIVACY_VERIFICATION_EMAIL_ENABLED = 'true'; },
    env => { env.PRIVACY_ISOLATED_RESET = 'execute-once'; },
    env => { env.PRIVACY_ISOLATED_CLEANUP_APPROVED_REVISION = '0'.repeat(40); },
  ]) {
    const env = authorizedEnvironment(); mutate(env);
    assert.throws(() => validateCleanupEnvironment(env));
  }
});

test('writer exclusion holds and releases the advisory lock and rejects other writer transactions', async () => {
  const calls = [];
  const accepted = {
    $queryRawUnsafe: async query => {
      calls.push(query);
      if (query.includes('pg_try_advisory_lock')) return [{ acquired: true }];
      if (query.includes('pg_stat_activity')) return [{ count: 0 }];
      if (query.includes('pg_advisory_unlock')) return [{ released: true }];
      assert.fail('unexpected query');
    },
  };
  const release = await acquireWriterExclusion(accepted);
  await release(); await release();
  assert.equal(calls.some(query => query.includes('backend_xid IS NOT NULL')), true);
  assert.equal(calls.filter(query => query.includes('pg_advisory_unlock')).length, 1);

  let unlocked = false;
  await assert.rejects(acquireWriterExclusion({
    $queryRawUnsafe: async query => {
      if (query.includes('pg_try_advisory_lock')) return [{ acquired: true }];
      if (query.includes('pg_stat_activity')) return [{ count: 1 }];
      if (query.includes('pg_advisory_unlock')) { unlocked = true; return [{ released: true }]; }
      return [];
    },
  }), /OTHER_DATABASE_WRITERS_PRESENT/);
  assert.equal(unlocked, true);
  await assert.rejects(acquireWriterExclusion({
    $queryRawUnsafe: async () => [{ acquired: false }],
  }), /CLEANUP_LOCK_UNAVAILABLE/);
});

test('complete trigger definitions and exact migration ledger are required', () => {
  assert.equal(triggerDefinitionReport(triggerRows()).pass, true);
  const changed = triggerRows(); changed[0].event_object_table = 'Customer';
  assert.equal(triggerDefinitionReport(changed).pass, false);
  assert.equal(triggerFunctionDefinitionReport(triggerFunctionRows()).pass, true);
  const changedFunction = triggerFunctionRows(); changedFunction[0].source_body += ' RETURN NULL;';
  assert.equal(triggerFunctionDefinitionReport(changedFunction).pass, false);
  const expected = expectedMigrationEvidence();
  const rows = expected.map(row => ({
    migration_name: row.name, checksum: row.checksum, finished: true, rolled_back: false,
  }));
  assert.equal(migrationLedgerReport(rows, expected).pass, true);
  rows[0].checksum = '0'.repeat(64);
  assert.equal(migrationLedgerReport(rows, expected).pass, false);
});

const postCleanupPrisma = ({ nonemptyTable, changedTrigger, changedTriggerFunction, changedLedger } = {}) => {
  const migrations = expectedMigrationEvidence().map(row => ({
    migration_name: row.name, checksum: row.checksum, finished: true, rolled_back: false,
  }));
  if (changedLedger) migrations[0].checksum = '0'.repeat(64);
  return {
    $queryRawUnsafe: async query => {
      if (query.includes('information_schema.tables')) {
        return [...REQUIRED_STARTUP_TABLES, '_prisma_migrations'].map(table_name => ({ table_name }));
      }
      if (query.includes('COUNT(*)::int')) {
        const table = query.match(/FROM "([^"]+)"/)?.[1];
        return [{ count: table === nonemptyTable ? 1 : 0 }];
      }
      if (query.includes('FROM "_prisma_migrations"')) return migrations;
      if (query.includes('information_schema.triggers')) {
        const rows = triggerRows();
        if (changedTrigger) rows[0].event_manipulation = 'TRUNCATE';
        return rows;
      }
      if (query.includes('FROM pg_proc')) {
        const rows = triggerFunctionRows();
        if (changedTriggerFunction) rows[0].source_body += ' RETURN NULL;';
        return rows;
      }
      assert.fail(`unexpected query category`);
    },
  };
};

test('post-cleanup verification requires empty tables, schema diff, ledger and full triggers', async () => {
  const goodDiff = () => ({ status: 0, stdout: 'No difference detected.', stderr: '' });
  const report = await verifyEmptyCompatibleDatabase(postCleanupPrisma(), goodDiff);
  assert.equal(report.pass, true);
  assert.equal(report.nonemptyApplicationTableCount, 0);
  assert.equal(report.triggerDefinitions.actualDefinitionRows, 10);
  assert.equal(report.triggerFunctions.actualFunctionCount, 2);
  await assert.rejects(verifyEmptyCompatibleDatabase(postCleanupPrisma({ nonemptyTable: 'PrivacyAudit' }), goodDiff),
    /POST_CLEANUP_APPLICATION_ROWS_PRESENT/);
  await assert.rejects(verifyEmptyCompatibleDatabase(postCleanupPrisma({ changedTrigger: true }), goodDiff),
    /POST_CLEANUP_TRIGGER_MISMATCH/);
  await assert.rejects(verifyEmptyCompatibleDatabase(postCleanupPrisma({ changedTriggerFunction: true }), goodDiff),
    /POST_CLEANUP_TRIGGER_FUNCTION_MISMATCH/);
  await assert.rejects(verifyEmptyCompatibleDatabase(postCleanupPrisma({ changedLedger: true }), goodDiff),
    /POST_CLEANUP_MIGRATION_LEDGER_MISMATCH/);
  assert.throws(() => runPrismaSchemaDiff(() => ({ status: 2, stdout: 'postgresql://private', stderr: '' })),
    error => error.message === 'SCHEMA_DIFF_NONEMPTY' && !error.message.includes('private'));
  assert.throws(() => runPrismaSchemaDiff(() => ({ status: 1, stdout: '', stderr: 'password=private' })),
    error => error.message === 'SCHEMA_DIFF_UNAVAILABLE' && !error.message.includes('private'));
});

test('orchestration refuses before destruction and releases lock after partial rebuild failure', async () => {
  const events = [];
  const prisma = {
    $connect: async () => { events.push('connect'); },
    $executeRawUnsafe: async sql => { events.push(sql.startsWith('DROP') ? 'drop' : 'create'); },
    $disconnect: async () => { events.push('disconnect'); },
  };
  const common = {
    env: authorizedEnvironment(),
    createPrisma: () => prisma,
    acquireExclusion: async () => { events.push('lock'); return async () => { events.push('unlock'); }; },
  };
  await assert.rejects(runCompletedPhoneCleanup({
    ...common,
    inspectFixture: async () => { const error = new Error('FIXTURE_COUNT_PrivacyAudit'); error.safeCode = error.message; throw error; },
    applyBaseline: () => events.push('apply'),
  }), error => error.cleanupFailure?.category === 'FIXTURE_STATE_REFUSED');
  assert.deepEqual(events, ['connect', 'lock', 'unlock', 'disconnect']);

  events.length = 0;
  await assert.rejects(runCompletedPhoneCleanup({
    ...common,
    inspectFixture: async () => ({ state: COMPLETED_PHONE_CLEANUP_GATE, pass: true }),
    applyBaseline: () => { events.push('apply'); throw new Error('private database exception'); },
    verifyCompatibility: async () => { events.push('verify'); },
  }), error => error.cleanupFailure?.category === 'REBUILD_FAILED' &&
      JSON.stringify(error.cleanupFailure).includes('private') === false);
  assert.deepEqual(events, ['connect', 'lock', 'drop', 'create', 'apply', 'unlock', 'disconnect']);

  let created = false;
  const wrong = authorizedEnvironment(); wrong.RENDER_SERVICE_ID = 'srv-production';
  await assert.rejects(runCompletedPhoneCleanup({
    env: wrong,
    createPrisma: () => { created = true; return prisma; },
  }), error => error.cleanupFailure?.category === 'TARGET_REFUSED');
  assert.equal(created, false);
});

test('successful orchestration rebuilds only after fixture and lock checks', async () => {
  const events = [];
  const prisma = {
    $connect: async () => { events.push('connect'); },
    $executeRawUnsafe: async sql => { events.push(sql.startsWith('DROP') ? 'drop' : 'create'); },
    $disconnect: async () => { events.push('disconnect'); },
  };
  const result = await runCompletedPhoneCleanup({
    env: authorizedEnvironment(),
    createPrisma: () => prisma,
    acquireExclusion: async () => { events.push('lock'); return async () => { events.push('unlock'); }; },
    inspectFixture: async () => { events.push('fixture'); return { state: COMPLETED_PHONE_CLEANUP_GATE, pass: true }; },
    applyBaseline: () => { events.push('apply'); },
    verifyCompatibility: async () => {
      events.push('verify');
      return {
        nonemptyApplicationTableCount: 0,
        tableInventory: { pass: true }, triggerDefinitions: { pass: true }, triggerFunctions: { pass: true },
        schemaDiff: { pass: true }, migrationLedger: { pass: true }, pass: true,
      };
    },
  });
  assert.equal(result.pass, true);
  assert.deepEqual(events, ['connect', 'lock', 'fixture', 'drop', 'create', 'apply', 'verify', 'unlock', 'disconnect']);
});

test('migration ledger records only SQL files that completed successfully on the exact cleanup target', () => {
  const prior = { ...process.env };
  Object.assign(process.env, authorizedEnvironment());
  try {
    const calls = [];
    assert.throws(() => applyPinnedBaselineAndPrivacyMigrations(materializePinnedBaselineSchema(), {
      recordExecutedSql: true,
      recordingScope: 'authorized-render-completed-phone-cleanup-v1',
      execute: (_executable, args) => {
        calls.push(args);
        if (args.includes('--file') && args.some(value => String(value).includes(PRIVACY_MIGRATION_SECOND))) {
          throw new Error('private SQL failure');
        }
      },
    }), /private SQL failure/);
    const applied = calls.filter(args => args.includes('--applied')).map(args => args[args.indexOf('--applied') + 1]);
    assert.deepEqual(applied, ['20261023030000_customer_privacy_requests']);
  } finally {
    for (const key of Object.keys(process.env)) if (!Object.hasOwn(prior, key)) delete process.env[key];
    Object.assign(process.env, prior);
  }
});

test('sanitized failure never includes raw error details', () => {
  const result = sanitizedFailure('REBUILD', new Error('postgresql://user:password@private/database'));
  assert.deepEqual(result, {
    check: 'SPEEDY_COMPLETED_PHONE_FIXTURE_CLEANUP', result: 'REFUSED', stage: 'REBUILD',
    category: 'REBUILD_FAILED', safeCode: 'DETAILS_WITHHELD', pass: false,
  });
  assert.doesNotMatch(JSON.stringify(result), /password|private/);
});

const PRIVACY_MIGRATION_SECOND = '20261023150000_privacy_access_credentials';
