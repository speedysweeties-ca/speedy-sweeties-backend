process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } = require('@aws-sdk/client-s3');
const { PrivacyRecoveryJournal } = require('../dist/services/privacyRecoveryJournal');
const { S3ProtectedDecisionStore, createRecoveryS3Client } = require('../dist/services/privacyRecoveryS3');
const { ControlledS3, syntheticS3Journal, config, keyOf, error } = require('./privacyRecoveryS3Fixture.cjs');
const key = 'synthetic-s3-digest-key-distinct';
const next = async journal => journal.intent((await journal.ready()).head, 'SYNTHETIC', { request: { id: 'synthetic-case' } });
const restart = f => new PrivacyRecoveryJournal(new S3ProtectedDecisionStore(f.activeConfig, f.transport), config.scope, key);

test('S3 enrollment is explicit, target-bound and pinned outside the database', async () => {
  const transport = new ControlledS3();
  for (const patch of [{ bucket: 'invalid.bucket' }, { ownerAccountId: '' }, { prefix: '../production/' }, { genesisHash: '' }])
    assert.throws(() => new S3ProtectedDecisionStore({ ...config, mode: 'active', genesisHash: 'a'.repeat(64), ...patch }, transport), /CONFIGURATION_REQUIRED/);
  const empty = new S3ProtectedDecisionStore({ ...config, mode: 'active', genesisHash: 'a'.repeat(64) }, transport);
  await assert.rejects(empty.read(), /COVERAGE_REQUIRED/);
  assert.equal(transport.calls.filter(c => c.type === 'PutObjectCommand').length, 0);
  const f = await syntheticS3Journal(key);
  const wrong = new S3ProtectedDecisionStore({ ...f.activeConfig, genesisHash: 'b'.repeat(64) }, f.transport);
  await assert.rejects(wrong.read(), /ENROLLMENT_MISMATCH/);
  const intent = await next(f.journal);
  await assert.rejects(f.journal.ready(), /UNFINISHED_OPERATION/);
  await f.journal.committed(intent);
  assert.equal((await restart(f).ready()).cases.size, 1);
});

test('one immutable object arbitrates concurrent writers without a second head write', async () => {
  const f = await syntheticS3Journal(key), other = restart(f), head = (await f.journal.ready()).head;
  let arrivals = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  f.transport.before = async command => {
    if (command instanceof PutObjectCommand) { if (++arrivals === 2) release(); await barrier; }
  };
  const results = await Promise.allSettled([f.journal.intent(head, 'ONE', { request: { id: 'one' } }), other.intent(head, 'TWO', { request: { id: 'two' } })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(results.find(r => r.status === 'rejected').reason.code, /CONCURRENT_WRITE/);
  assert.equal(f.transport.objects.size, 2);
  assert.ok([...f.transport.objects.keys()].every(k => /\d{16}\.json$/.test(k)));
  await assert.rejects(restart(f).ready(), /UNFINISHED_OPERATION/);
});

test('accepted PUT with lost response resolves once by identical content; restart and exact retry are idempotent', async () => {
  const f = await syntheticS3Journal(key), head = (await f.journal.ready()).head;
  f.transport.after = command => { if (command instanceof PutObjectCommand) throw error('TimeoutError', undefined); };
  const intent = await f.journal.intent(head, 'SYNTHETIC', { request: { id: 'case' } });
  const entry = JSON.parse(f.transport.objects.get(keyOf(2)));
  const before = f.transport.calls.filter(c => c.type === 'PutObjectCommand').length;
  await new S3ProtectedDecisionStore(f.activeConfig, f.transport).append(head, entry);
  assert.equal(f.transport.calls.filter(c => c.type === 'PutObjectCommand').length, before);
  await f.journal.committed(intent);
  assert.equal((await restart(f).ready()).cases.size, 1);
});

test('uncertain absent PUT, 409, late arrival and failed resolution never trigger another write', async () => {
  for (const code of [undefined, 409, 503]) {
    const f = await syntheticS3Journal(key);
    f.transport.before = command => { if (command instanceof PutObjectCommand) throw error('SyntheticWriteFailure', code); };
    const before = f.transport.calls.filter(c => c.type === 'PutObjectCommand').length;
    await assert.rejects(next(f.journal), /WRITE_UNCERTAIN/);
    assert.equal(f.transport.calls.filter(c => c.type === 'PutObjectCommand').length, before + 1);
    assert.equal(f.transport.objects.size, 1);
    // A response/read-back cannot prove a timed-out upload will not arrive later.
    const pending = f.transport.calls.findLast(c => c.type === 'PutObjectCommand');
    f.transport.objects.set(pending.input.Key, pending.input.Body);
    await assert.rejects(restart(f).ready(), /UNFINISHED_OPERATION/);
  }
  const f = await syntheticS3Journal(key);
  f.transport.after = command => { if (command instanceof PutObjectCommand) {
    f.transport.before = c => { if (c instanceof GetObjectCommand) throw error('AccessDenied', 403); };
    throw error('TimeoutError');
  } };
  await assert.rejects(next(f.journal), /WRITE_UNCERTAIN/);
});

test('failure between INTENT, database commit and COMMIT stays unfinished across restart', async () => {
  const f = await syntheticS3Journal(key);
  const intent = await next(f.journal);
  f.transport.failKind = 'COMMIT';
  await assert.rejects(f.journal.committed(intent), /WRITE_UNCERTAIN/);
  await assert.rejects(restart(f).ready(), /UNFINISHED_OPERATION/);
  assert.equal(f.transport.objects.size, 2);
});

test('missing/altered entries, stale listing, stale expected head and same-process rollback stop', async () => {
  const f = await syntheticS3Journal(key), originalHead = (await f.journal.ready()).head;
  const intent = await next(f.journal); await f.journal.committed(intent);
  const saved = new Map(f.transport.objects);
  f.transport.objects.delete(keyOf(2));
  await assert.rejects(restart(f).ready(), /HISTORY_INCOMPLETE/);
  f.transport.objects = new Map(saved);
  const changed = JSON.parse(f.transport.objects.get(keyOf(2))); changed.payload.state.request.id = 'altered';
  f.transport.objects.set(keyOf(2), JSON.stringify(changed));
  await assert.rejects(restart(f).ready(), /HISTORY_INVALID/);
  f.transport.objects = new Map(saved); f.transport.listLimit = 1;
  await assert.rejects(restart(f).ready(), /HISTORY_ADVANCED/);
  f.transport.listLimit = Infinity;
  await assert.rejects(f.journal.intent(originalHead, 'STALE', { request: { id: 'stale' } }), /CONCURRENT_WRITE/);
  await f.journal.ready(); f.transport.objects.delete(keyOf(3));
  await assert.rejects(f.journal.ready(), /HISTORY_ROLLED_BACK/);
  f.transport.objects.clear();
  await assert.rejects(restart(f).ready(), /COVERAGE_REQUIRED/);
});

test('permission failures and malformed listings/bodies expose only fixed safe codes', async () => {
  for (const kind of [GetObjectCommand, ListObjectsV2Command, PutObjectCommand]) {
    const f = await syntheticS3Journal(key);
    f.transport.before = command => { if (command instanceof kind) throw error('AccessDenied', 403); };
    await assert.rejects(next(f.journal), e => e.code === 'RECOVERY_STORAGE_PERMISSION_DENIED' && !e.message.includes('provider detail'));
  }
  const f = await syntheticS3Journal(key);
  f.transport.objects.set(keyOf(1), '{broken synthetic json');
  await assert.rejects(f.journal.ready(), /HISTORY_INVALID/);
});

test('paginated reads preserve one ordered prefix and stop on a racing append', async () => {
  const f = await syntheticS3Journal(key); const intent = await next(f.journal); await f.journal.committed(intent);
  f.transport.pageSize = 1;
  assert.equal((await restart(f).ready()).head.sequence, 3);
  f.transport.before = async command => {
    if (command instanceof ListObjectsV2Command && command.input.StartAfter === keyOf(3)) {
      f.transport.before = null;
      await f.journal.intent((await restart(f).ready()).head, 'RACING', { request: { id: 'race' } });
    }
  };
  await assert.rejects(restart(f).ready(), /HISTORY_ADVANCED/);
});

test('privileged coherent tail deletion after bypassing policy is outside the trust boundary', async () => {
  const f = await syntheticS3Journal(key); const intent = await next(f.journal); await f.journal.committed(intent);
  f.transport.objects.delete(keyOf(2)); f.transport.objects.delete(keyOf(3));
  // HMAC/versioning cannot detect a removed valid suffix on a fresh process.
  // Production security therefore MUST deny active-prefix deletes, not promise
  // cryptographic protection against an administrator changing those policies.
  assert.equal((await restart(f).ready()).head.sequence, 1);
});

test('official SDK serializes conditional/encryption/owner headers and disables retries at the fixed AWS endpoint', async () => {
  const client = createRecoveryS3Client();
  assert.equal(await client.config.region(), 'ca-central-1'); assert.equal(await client.config.maxAttempts(), 1);
  assert.equal(client.config.followRegionRedirects, false);
  client.config.credentials = async () => ({ accessKeyId: 'SYNTHETICACCESSKEY', secretAccessKey: 'synthetic-test-only-secret' });
  let requests = 0;
  client.config.requestHandler = { metadata: { handlerProtocol: 'http/1.1' }, handle: async request => {
    requests++; assert.equal(request.hostname, 'synthetic-privacy-decisions.s3.ca-central-1.amazonaws.com');
    assert.equal(request.headers['if-none-match'], '*'); assert.equal(request.headers['x-amz-server-side-encryption'], 'AES256');
    assert.equal(request.headers['x-amz-expected-bucket-owner'], config.ownerAccountId);
    return { response: { statusCode: 503, headers: {}, body: Readable.from(['<Error><Code>ServiceUnavailable</Code></Error>']) } };
  } };
  await assert.rejects(client.send(new PutObjectCommand({ Bucket: config.bucket, Key: keyOf(1), Body: '{}',
    ExpectedBucketOwner: config.ownerAccountId, IfNoneMatch: '*', ServerSideEncryption: 'AES256' })), e => e.$metadata.httpStatusCode === 503);
  assert.equal(requests, 1); client.destroy();
});

test('official SDK empty LIST XML works with prefix-restricted absence probes without missing-key GETs', async () => {
  const client = createRecoveryS3Client();
  client.config.credentials = async () => ({ accessKeyId: 'SYNTHETICACCESSKEY', secretAccessKey: 'synthetic-test-only-secret' });
  let requests = 0;
  client.config.requestHandler = { handle: async request => {
    requests++; assert.equal(request.method, 'GET'); assert.equal(request.query.prefix, config.prefix);
    assert.equal(request.query['list-type'], '2');
    return { response: { statusCode: 200, headers: { 'content-type': 'application/xml' },
      body: Readable.from(['<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><KeyCount>0</KeyCount><IsTruncated>false</IsTruncated></ListBucketResult>']) } };
  } };
  const store = new S3ProtectedDecisionStore({ ...config, mode: 'enrollment' }, client);
  assert.deepEqual(await store.read(), { head: { sequence: 0, hash: '' }, entries: [] });
  assert.equal(requests, 2); client.destroy();
});
