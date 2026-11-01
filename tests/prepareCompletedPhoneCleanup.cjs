'use strict';

const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const {
  materializePinnedBaselineSchema,
  applyPinnedBaselineAndPrivacyMigrations,
} = require('./privacyBaseline.cjs');
const {
  AUTHORIZED_RENDER_DATABASE_ID,
  validateAuthorizedRenderTarget,
} = require('./privacyRenderTarget.cjs');
const {
  COMPLETED_PHONE_CLEANUP_GATE,
  WRITER_EXCLUSION_CONFIRMATION,
  reviewedSourceReport,
  inspectCompletedPhoneFixture,
  acquireWriterExclusion,
  verifyEmptyCompatibleDatabase,
  singleConnectionUrl,
} = require('./privacyCompletedPhoneCleanup.cjs');

const CHECK = 'SPEEDY_COMPLETED_PHONE_FIXTURE_CLEANUP';

function validateCleanupEnvironment(env) {
  const { url } = validateAuthorizedRenderTarget(env);
  assert.equal(env.PRIVACY_ISOLATED_CLEANUP, COMPLETED_PHONE_CLEANUP_GATE);
  assert.equal(env.PRIVACY_ISOLATED_WRITERS_EXCLUDED, WRITER_EXCLUSION_CONFIRMATION);
  assert.ok(!env.PRIVACY_ISOLATED_RESET || env.PRIVACY_ISOLATED_RESET === 'disabled');
  assert.equal(env.PRIVACY_ISOLATED_DIAGNOSTICS_ONLY, 'true');
  assert.equal(env.PRIVACY_DELETION_ENABLED, 'false');
  assert.equal(env.PRIVACY_VERIFICATION_PHONE_ENABLED, 'false');
  assert.equal(env.PRIVACY_VERIFICATION_EMAIL_ENABLED, 'false');
  assert.equal(env.PRIVACY_FULFILLMENT_ENABLED, 'false');
  assert.match(env.RENDER_GIT_COMMIT || '', /^[a-f0-9]{40}$/);
  assert.equal(env.PRIVACY_ISOLATED_CLEANUP_APPROVED_REVISION, env.RENDER_GIT_COMMIT);
  assert.equal(url.hostname, AUTHORIZED_RENDER_DATABASE_ID, 'internal database hostname required');
  const source = reviewedSourceReport();
  assert.equal(source.pass, true, 'reviewed cleanup source mismatch');
  return { source };
}

function sanitizedFailure(stage, error) {
  const categories = {
    TARGET: 'TARGET_REFUSED',
    WRITER_EXCLUSION: 'WRITER_EXCLUSION_REFUSED',
    FIXTURE: 'FIXTURE_STATE_REFUSED',
    REBUILD: 'REBUILD_FAILED',
    COMPATIBILITY: 'COMPATIBILITY_FAILED',
    CLEANUP: 'CLEANUP_FAILED',
  };
  const safeCode = typeof error?.safeCode === 'string' && /^[A-Z0-9_]+$/.test(error.safeCode)
    ? error.safeCode : 'DETAILS_WITHHELD';
  return { check: CHECK, result: 'REFUSED', stage, category: categories[stage] || 'CLEANUP_FAILED', safeCode, pass: false };
}

async function runCompletedPhoneCleanup({
  env = process.env,
  createPrisma = url => new PrismaClient({ datasources: { db: { url } }, log: [] }),
  inspectFixture = inspectCompletedPhoneFixture,
  acquireExclusion = acquireWriterExclusion,
  applyBaseline = applyPinnedBaselineAndPrivacyMigrations,
  verifyCompatibility = verifyEmptyCompatibleDatabase,
} = {}) {
  let stage = 'TARGET';
  let prisma;
  let release;
  try {
    const { source } = validateCleanupEnvironment(env);
    const baselinePath = materializePinnedBaselineSchema();
    prisma = createPrisma(singleConnectionUrl(env.DATABASE_URL));
    await prisma.$connect();

    stage = 'WRITER_EXCLUSION';
    release = await acquireExclusion(prisma);

    stage = 'FIXTURE';
    const fixture = await inspectFixture(prisma);
    assert.deepEqual(fixture, { state: COMPLETED_PHONE_CLEANUP_GATE, pass: true });

    stage = 'REBUILD';
    await prisma.$executeRawUnsafe('DROP SCHEMA "public" CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA "public"');
    applyBaseline(baselinePath, {
      recordExecutedSql: true,
      recordingScope: 'authorized-render-completed-phone-cleanup-v1',
    });

    stage = 'COMPATIBILITY';
    const compatibility = await verifyCompatibility(prisma);
    assert.equal(compatibility.pass, true);
    return {
      check: CHECK,
      result: 'CLEANUP_REBUILT_AND_VERIFIED',
      reviewedSource: source,
      fixtureState: fixture.state,
      writerExclusion: true,
      applicationStateEmpty: compatibility.nonemptyApplicationTableCount === 0,
      currentSchemaCompatibility: compatibility.tableInventory.pass &&
        compatibility.triggerDefinitions.pass && compatibility.triggerFunctions.pass &&
        compatibility.schemaDiff.pass,
      privacyMigrationLedgerCompatibility: compatibility.migrationLedger.pass,
      compatibility,
      pass: true,
    };
  } catch (error) {
    throw Object.assign(new Error('SANITIZED_CLEANUP_FAILURE'), {
      cleanupFailure: sanitizedFailure(stage, error),
    });
  } finally {
    if (release) await release().catch(() => {});
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
}

async function main() {
  try {
    const result = await runCompletedPhoneCleanup();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(error.cleanupFailure || sanitizedFailure('CLEANUP', error))}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  CHECK,
  validateCleanupEnvironment,
  sanitizedFailure,
  runCompletedPhoneCleanup,
};
