// Prepared manual-only cloud verifier. Normal CI never sets this authorization.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const RUN_ID = 'recovery-integration-20261028';
const PREFIX = `verification/${RUN_ID}/`;
const BUCKET = 'speedy-sweeties-privacy-decisions-080413009273', OWNER = '080413009273';
const APP_ARN = `arn:aws:iam::${OWNER}:user/SpeedyPrivacyJournalApplication`;
function guardedIdentity(e, invoke = () => JSON.parse(execFileSync('aws', ['sts', 'get-caller-identity', '--output', 'json', '--no-cli-pager', '--region', 'ca-central-1'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, env: { ...e, AWS_MAX_ATTEMPTS: '1', AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: 'true' } }))) {
  assert.equal(e.NODE_ENV, 'test', 'CLOUD_TEST_ENVIRONMENT_REQUIRED');
  assert.equal(e.PRIVACY_SYNTHETIC_DATABASE, 'yes', 'SYNTHETIC_DATABASE_REQUIRED');
  assert.equal(e.PRIVACY_S3_CLOUD_VERIFICATION_AUTHORIZED, RUN_ID, 'EXPLICIT_CLOUD_AUTHORIZATION_REQUIRED');
  for (const gate of ['PRIVACY_DELETION_ENABLED', 'PRIVACY_FULFILLMENT_ENABLED', 'PRIVACY_VERIFICATION_EMAIL_ENABLED', 'PRIVACY_VERIFICATION_PHONE_ENABLED'])
    assert.equal(e[gate], 'false', 'CLOUD_TEST_GATES_MUST_STAY_FALSE');
  assert.ok(e.AWS_ACCESS_KEY_ID && e.AWS_SECRET_ACCESS_KEY && !e.AWS_SESSION_TOKEN && !e.AWS_ROLE_ARN, 'DEDICATED_APPLICATION_CREDENTIALS_REQUIRED');
  const url = new URL(e.DATABASE_URL);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/speedy_privacy_synthetic'); assert.equal(url.username, 'privacy_test');
  const identity = invoke();
  assert.ok(identity.Account === OWNER && identity.Arn === APP_ARN, 'APPLICATION_IDENTITY_MISMATCH');
  return { bucket: BUCKET, ownerAccountId: OWNER, prefix: PREFIX + 'journal/', scope: 'synthetic-cloud-privacy-fixture' };
}
async function cloudTransport(e = process.env, requireEmpty = true) {
  const config = guardedIdentity(e);
  const { createRecoveryS3Client } = require('../dist/services/privacyRecoveryS3');
  const { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, ListObjectVersionsCommand } = require('@aws-sdk/client-s3');
  const client = createRecoveryS3Client({ accessKeyId: e.AWS_ACCESS_KEY_ID, secretAccessKey: e.AWS_SECRET_ACCESS_KEY });
  const calls = [], elapsed = [], objects = new Map(), known = new Set();
  const transport = { objects, failKind: null, after: null,
    async send(command, options) {
      assert.ok(calls.length < 10000, 'CLOUD_CALL_BUDGET_EXCEEDED');
      assert.equal(command.input.Bucket, BUCKET); assert.equal(command.input.ExpectedBucketOwner, OWNER);
      const location = command.input.Key || command.input.Prefix;
      assert.ok(location?.startsWith(PREFIX), 'CLOUD_SCOPE_REJECTED');
      if (command instanceof PutObjectCommand) {
        assert.ok(calls.filter(c => c === 'PutObjectCommand').length < 150, 'CLOUD_WRITE_BUDGET_EXCEEDED');
        assert.ok(Buffer.byteLength(command.input.Body) <= 16384, 'CLOUD_SYNTHETIC_PAYLOAD_BUDGET_EXCEEDED');
        if (JSON.parse(command.input.Body).kind === transport.failKind)
          throw Object.assign(new Error('synthetic interrupted storage write'), { $metadata: { httpStatusCode: 503 } });
      }
      if (command instanceof GetObjectCommand && known.has(location) && !transport.objects.has(location))
        throw Object.assign(new Error('synthetic omitted history response'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
      const at = performance.now(); calls.push(command.constructor.name);
      const response = await client.send(command, options); elapsed.push(performance.now() - at);
      if (command instanceof ListObjectsV2Command) response.Contents = (response.Contents || []).filter(o => !known.has(o.Key) || transport.objects.has(o.Key));
      if (command instanceof PutObjectCommand) { known.add(location); transport.objects.set(location, command.input.Body); }
      if (transport.after) await transport.after(command);
      return response;
    },
    summary() { const sorted = elapsed.slice().sort((a, b) => a - b); return { cloudCalls: calls.length,
      puts: calls.filter(c => c === 'PutObjectCommand').length, requestP95Ms: Math.ceil(sorted[Math.floor(sorted.length * 0.95)] || 0), maxRequestMs: Math.ceil(sorted.at(-1) || 0) }; }
  };
  if (requireEmpty) {
    const versions = await client.send(new ListObjectVersionsCommand({ Bucket: BUCKET, ExpectedBucketOwner: OWNER, Prefix: PREFIX, MaxKeys: 1 }));
    assert.ok(!(versions.Versions?.length || versions.DeleteMarkers?.length || versions.IsTruncated), 'CLOUD_TEST_PREFIX_NOT_EMPTY');
  }
  return { config, transport, client };
}
async function probes() {
  const f = await cloudTransport(process.env, false);
  const { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectVersionsCommand } = require('@aws-sdk/client-s3');
  const { S3ProtectedDecisionStore } = require('../dist/services/privacyRecoveryS3');
  const { PrivacyRecoveryJournal } = require('../dist/services/privacyRecoveryJournal');
  const input = { Bucket: BUCKET, ExpectedBucketOwner: OWNER };
  const found = await f.client.send(new ListObjectVersionsCommand({ ...input, Prefix: PREFIX + 'journal/', MaxKeys: 1000 }));
  const original = found.Versions?.find(v => v.IsLatest);
  assert.ok(original, 'SYNTHETIC_JOURNAL_REQUIRED');
  const read = await f.client.send(new GetObjectCommand({ ...input, Key: original.Key }));
  assert.equal(read.$metadata.httpStatusCode, 200); await read.Body.transformToString();
  const denied = async command => assert.rejects(f.client.send(command), error => error.$metadata?.httpStatusCode === 403);
  await denied(new GetObjectCommand({ ...input, Key: 'verification/unapproved-run/0000000000000001.json' }));
  await denied(new GetObjectCommand({ ...input, Key: original.Key, VersionId: original.VersionId }));
  await denied(new DeleteObjectCommand({ ...input, Key: original.Key }));
  await denied(new PutObjectCommand({ ...input, Key: original.Key, Body: '{}', ServerSideEncryption: 'AES256' }));
  await assert.rejects(f.client.send(new PutObjectCommand({ ...input, Key: original.Key, Body: '{}', ServerSideEncryption: 'AES256', IfNoneMatch: '*' })), e => e.$metadata?.httpStatusCode === 412);
  const key = 'synthetic-cloud-race-digest-only', config = { ...f.config, prefix: PREFIX + 'race/', scope: 'synthetic-cloud-race', mode: 'enrollment' };
  let journal = new PrivacyRecoveryJournal(new S3ProtectedDecisionStore(config, f.transport), config.scope, key);
  const empty = { count: async () => 0 }; await journal.enrollEmptyDatabase({ privacyDeletionRequest: empty, privacyDeletedIdentity: empty, privacyAudit: empty, privacyExternalTask: empty });
  const pin = (await journal.ready()).enrollmentHash, active = { ...config, mode: 'active', genesisHash: pin };
  journal = new PrivacyRecoveryJournal(new S3ProtectedDecisionStore(active, f.transport), config.scope, key);
  const other = new PrivacyRecoveryJournal(new S3ProtectedDecisionStore(active, f.transport), config.scope, key), head = (await journal.ready()).head;
  const outcomes = await Promise.allSettled([journal.intent(head, 'ONE', { request: { id: 'synthetic-one' } }), other.intent(head, 'TWO', { request: { id: 'synthetic-two' } })]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  await journal.committed(outcomes.find(r => r.status === 'fulfilled').value);
  let intercepted = false;
  f.transport.after = command => { if (!intercepted && command instanceof PutObjectCommand) { intercepted = true; throw new Error('synthetic lost response after AWS acceptance'); } };
  const intent = await journal.intent((await journal.ready()).head, 'UNCERTAIN_RESPONSE', { request: { id: 'synthetic-uncertain' } });
  f.transport.after = null; await journal.committed(intent);
  const restarted = new PrivacyRecoveryJournal(new S3ProtectedDecisionStore(active, f.transport), config.scope, key);
  const readStarted = performance.now();
  assert.equal((await restarted.ready()).cases.size, 2);
  const fullReadMs = Math.ceil(performance.now() - readStarted); assert.ok(fullReadMs < 4000);
  console.log(JSON.stringify({ check: 'SPEEDY_S3_CLOUD_PROBES', allowedDeniedPassed: true, conditionalRacePassed: true,
    acceptedWriteResolutionPassed: true, restartPassed: true, fullReadMs, cleanup: 'REQUIRED_IN_OWNER_CLOUDSHELL', ...f.transport.summary() }));
  f.client.destroy();
}
module.exports = { RUN_ID, PREFIX, BUCKET, OWNER, guardedIdentity, cloudTransport };
if (require.main === module) probes().catch(() => { console.log(JSON.stringify({ check: 'SPEEDY_S3_CLOUD_PROBES', result: 'STOP_VERIFICATION_FAILURE', cleanup: 'REQUIRED_IN_OWNER_CLOUDSHELL' })); process.exitCode = 1; });
