process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrivacyRecoveryJournal } = require('../dist/services/privacyRecoveryJournal');
const { SyntheticDecisionStore } = require('./privacyRecoveryFixture.cjs');
const { prepareRecoverySuccessor } = require('../dist/services/privacyRecoveryMaintenance');
const { removeVerifiedRetiredS3History } = require('../dist/services/privacyRecoveryRetirement');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
async function fixture() {
  const key = 'synthetic-offline-retirement-key', source = new PrivacyRecoveryJournal(new SyntheticDecisionStore(), 'speedy-privacy-production-epoch-0001', key);
  const empty = { count: async () => 0 }; await source.enrollEmptyDatabase({ privacyDeletionRequest: empty, privacyDeletedIdentity: empty, privacyAudit: empty, privacyExternalTask: empty });
  const successor = new PrivacyRecoveryJournal(new SyntheticDecisionStore(), 'speedy-privacy-production-epoch-0002', key);
  const coverage = await prepareRecoverySuccessor(source, successor, { reviewedAt: new Date().toISOString(), cases: [] }, true);
  const env = { PRIVACY_RECOVERY_S3_BUCKET: 'speedy-sweeties-privacy-decisions-080413009273', PRIVACY_RECOVERY_S3_EXPECTED_OWNER: '080413009273',
    PRIVACY_RECOVERY_S3_REGION: 'ca-central-1', PRIVACY_RECOVERY_S3_PREFIX: 'production/epoch-0002/',
    PRIVACY_RECOVERY_SCOPE: successor.scope, PRIVACY_RECOVERY_ENROLLMENT_HASH: coverage.enrollmentHash };
  let versions = [1, 2].map(n => ({ Key: `production/epoch-0001/${String(n).padStart(16, '0')}.json`, VersionId: `synthetic-${n}`, IsLatest: true }));
  const calls = [], operator = { async send(command) { calls.push(command); if (command instanceof DeleteObjectCommand) {
    versions = versions.filter(v => v.VersionId !== command.input.VersionId); return {};
  } return { Versions: versions.slice(), IsTruncated: false }; } };
  return { source, successor, env, calls, operator, replace: value => { versions = value; } };
}
test('retired deletion requires exact active pins and verified complete successor before any operator call', async () => {
  const f = await fixture();
  await assert.rejects(removeVerifiedRetiredS3History(f.source, f.successor, { ...f.env, PRIVACY_RECOVERY_ENROLLMENT_HASH: 'a'.repeat(64) }, true, f.operator), /COVERAGE_UNVERIFIED/);
  await assert.rejects(removeVerifiedRetiredS3History(f.source, f.successor, f.env, false, f.operator), /OFFLINE/);
  await assert.rejects(removeVerifiedRetiredS3History(f.successor, f.successor, f.env, true, f.operator), /TARGET_REJECTED/);
  assert.equal(f.calls.length, 0);
  const result = await removeVerifiedRetiredS3History(f.source, f.successor, f.env, true, f.operator);
  assert.equal(result.allVersionsRemoved, true); assert.equal(result.deletedVersions, 2);
  assert.equal((await f.successor.ready()).cases.size, 0);
  assert.ok(f.calls.every(c => c.input.ExpectedBucketOwner === '080413009273' && (c.input.Key || c.input.Prefix).startsWith('production/epoch-0001/')));
});
test('unknown inventory stops before deletion and interrupted deletion requires review without retry', async () => {
  const f = await fixture(); f.replace([{ Key: 'production/epoch-0002/0000000000000001.json', VersionId: 'synthetic', IsLatest: true }]);
  await assert.rejects(removeVerifiedRetiredS3History(f.source, f.successor, f.env, true, f.operator), /TARGET_REJECTED/);
  assert.equal(f.calls.filter(c => c instanceof DeleteObjectCommand).length, 0);
  const g = await fixture(); let deletes = 0;
  const failing = { async send(command, options) { if (command instanceof DeleteObjectCommand && ++deletes === 2) throw Error('synthetic outage'); return g.operator.send(command, options); } };
  const result = await removeVerifiedRetiredS3History(g.source, g.successor, g.env, true, failing);
  assert.equal(result.deletedVersions, 1); assert.equal(result.allVersionsRemoved, false); assert.equal(result.operatorReviewRequired, true);
  assert.equal(deletes, 2); await g.successor.ready();
});
