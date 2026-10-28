// Controlled SDK responses ONLY. No socket, credentials, AWS resources or AWS claims.
const assert = require('node:assert/strict');
const { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } = require('@aws-sdk/client-s3');
const config = { bucket: 'synthetic-privacy-decisions', ownerAccountId: '111122223333',
  prefix: 'verification/synthetic-fixture/', scope: 'synthetic-privacy-fixture-only' };
const keyOf = n => `${config.prefix}${String(n).padStart(16, '0')}.json`;
const error = (name, code) => Object.assign(new Error('synthetic provider detail must be withheld'), { name, $metadata: { httpStatusCode: code } });
class ControlledS3 {
  constructor() { this.objects = new Map(); this.calls = []; this.failKind = null; this.before = null; this.after = null; this.listLimit = Infinity; this.pageSize = 1000; }
  async send(command, options) {
    assert.ok(options.abortSignal instanceof AbortSignal);
    const input = command.input;
    assert.equal(input.Bucket, config.bucket); assert.equal(input.ExpectedBucketOwner, config.ownerAccountId);
    this.calls.push({ type: command.constructor.name, input: structuredClone(input) });
    if (this.before) await this.before(command);
    let result;
    if (command instanceof GetObjectCommand) {
      const body = this.objects.get(input.Key);
      if (body === undefined) throw error('NoSuchKey', 404);
      result = { ContentLength: Buffer.byteLength(body), Body: { transformToString: async () => body }, VersionId: 'synthetic-current-version' };
    } else if (command instanceof ListObjectsV2Command) {
      const keys = [...this.objects.keys()].filter(k => k.startsWith(input.Prefix) && (!input.StartAfter || k > input.StartAfter))
        .sort().slice(0, input.MaxKeys === 1000 ? this.listLimit : Infinity);
      const start = Number(input.ContinuationToken || 0), end = start + Math.min(input.MaxKeys, this.pageSize);
      result = { Contents: keys.slice(start, end).map(Key => ({ Key })), IsTruncated: keys.length > end,
        ...(keys.length > end ? { NextContinuationToken: String(end) } : {}) };
    } else if (command instanceof PutObjectCommand) {
      assert.equal(input.IfNoneMatch, '*'); assert.equal(input.ServerSideEncryption, 'AES256');
      assert.equal(input.StorageClass, 'STANDARD');
      const entry = JSON.parse(input.Body);
      if (entry.kind === this.failKind) throw error('ServiceUnavailable', 503);
      if (this.objects.has(input.Key)) throw error('PreconditionFailed', 412);
      this.objects.set(input.Key, input.Body);
      result = { $metadata: { httpStatusCode: 200 }, VersionId: 'synthetic-current-version' };
    } else assert.fail('Unexpected SDK operation');
    if (this.after) await this.after(command);
    return result;
  }
}
async function syntheticS3Journal(key, db) {
  assert.equal(process.env.NODE_ENV, 'test');
  const { PrivacyRecoveryJournal } = require('../dist/services/privacyRecoveryJournal');
  const { S3ProtectedDecisionStore } = require('../dist/services/privacyRecoveryS3');
  const transport = new ControlledS3();
  const enrollment = new S3ProtectedDecisionStore({ ...config, mode: 'enrollment' }, transport);
  const first = new PrivacyRecoveryJournal(enrollment, config.scope, key);
  const empty = { count: async () => 0 };
  await first.enrollEmptyDatabase(db || { privacyDeletionRequest: empty, privacyDeletedIdentity: empty, privacyAudit: empty, privacyExternalTask: empty });
  const genesisHash = (await enrollment.read()).head.hash;
  const activeConfig = { ...config, mode: 'active', genesisHash };
  const store = Object.assign(new S3ProtectedDecisionStore(activeConfig, transport), { synthetic: transport });
  return { journal: new PrivacyRecoveryJournal(store, config.scope, key), store, transport, activeConfig };
}
module.exports = { ControlledS3, syntheticS3Journal, config, keyOf, error };
