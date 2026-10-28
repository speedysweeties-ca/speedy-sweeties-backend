import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { canonical, RecoveryError, type ProtectedDecisionStore, type RecoveryEntry, type RecoveryHead } from "./privacyRecoveryJournal";

export const RECOVERY_S3_REGION = "ca-central-1";
const MAX_ENTRIES = 10000, MAX_ENTRY_BYTES = 256 * 1024, MAX_HISTORY_BYTES = 16 * 1024 * 1024;
export type RecoveryS3Config = {
  bucket: string; ownerAccountId: string; prefix: string; scope: string;
  mode: "active" | "enrollment"; genesisHash?: string;
};
// Injectable transport for synthetic tests. Production uses the official client below.
export type RecoveryS3Transport = {
  send(command: GetObjectCommand | ListObjectsV2Command | PutObjectCommand, options: { abortSignal: AbortSignal }): Promise<any>;
};
const fail = (code: string): never => { throw new RecoveryError(code); };
const status = (error: any) => error?.$metadata?.httpStatusCode;
const permission = (error: any) => status(error) === 403 || error?.name === "AccessDenied";

// One conditional PUT is the append's linearization point. There is no mutable
// head object, second write, LIST-based lock, ETag hash assumption or version read.
// Trust requires the reviewed bucket/IAM policies: no deletes/overwrites of the
// active prefix, including by the maintenance role. Versioning alone is insufficient.
export class S3ProtectedDecisionStore implements ProtectedDecisionStore {
  private observed: RecoveryHead = { sequence: 0, hash: "" };
  private readonly config: RecoveryS3Config;
  constructor(config: RecoveryS3Config, private readonly client: RecoveryS3Transport) {
    this.config = { ...config };
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket) || !/^\d{12}$/.test(config.ownerAccountId) ||
        !/^(?:production|verification)\/[a-z0-9-]{1,64}\/$/.test(config.prefix) || !/^[a-zA-Z0-9_-]{1,100}$/.test(config.scope) ||
        !["active", "enrollment"].includes(config.mode) ||
        (config.mode === "active" && !/^[a-f0-9]{64}$/.test(config.genesisHash || "")) ||
        (config.mode === "enrollment" && config.genesisHash !== undefined)) fail("RECOVERY_S3_CONFIGURATION_REQUIRED");
  }
  private key(sequence: number) { return `${this.config.prefix}${String(sequence).padStart(16, "0")}.json`; }
  private target() { return { Bucket: this.config.bucket, ExpectedBucketOwner: this.config.ownerAccountId }; }
  private valid(entry: any, sequence: number): entry is RecoveryEntry {
    return entry && Object.keys(entry).sort().join() === "hash,kind,operation,payload,previous,scope,sequence" &&
      entry.sequence === sequence && entry.scope === this.config.scope && /^[a-f0-9]{64}$/.test(entry.hash) &&
      (sequence === 1 ? entry.previous === "" && entry.kind === "GENESIS" : /^[a-f0-9]{64}$/.test(entry.previous) && ["INTENT", "COMMIT"].includes(entry.kind)) &&
      typeof entry.operation === "string" && entry.operation.length > 0 && entry.operation.length <= 100;
  }
  private async get(sequence: number, signal: AbortSignal): Promise<RecoveryEntry | null> {
    let value;
    try { value = await this.client.send(new GetObjectCommand({ ...this.target(), Key: this.key(sequence) }), { abortSignal: signal }); }
    catch (error) {
      if (status(error) === 404 && (error as any)?.name === "NoSuchKey") return null;
      fail(permission(error) ? "RECOVERY_STORAGE_PERMISSION_DENIED" : "RECOVERY_STORAGE_UNAVAILABLE");
    }
    try {
      if (!Number.isInteger(value.ContentLength) || value.ContentLength < 1 || value.ContentLength > MAX_ENTRY_BYTES || !value.Body)
        fail("RECOVERY_HISTORY_INVALID");
      const body = await value.Body.transformToString("utf-8");
      if (Buffer.byteLength(body) !== value.ContentLength || Buffer.byteLength(body) > MAX_ENTRY_BYTES) fail("RECOVERY_HISTORY_INVALID");
      const entry = JSON.parse(body);
      if (!this.valid(entry, sequence)) fail("RECOVERY_HISTORY_INVALID");
      return entry;
    } catch (error) { if (error instanceof RecoveryError) throw error; fail("RECOVERY_HISTORY_INVALID"); }
  }
  private remember(head: RecoveryHead) {
    if (head.sequence < this.observed.sequence || (head.sequence === this.observed.sequence && head.hash !== this.observed.hash))
      fail("RECOVERY_HISTORY_ROLLED_BACK");
    this.observed = { ...head };
  }
  private async successor(sequence: number, signal: AbortSignal): Promise<RecoveryEntry | null> {
    let page;
    try { page = await this.client.send(new ListObjectsV2Command({ ...this.target(), Prefix: this.config.prefix,
      StartAfter: sequence ? this.key(sequence) : undefined, MaxKeys: 1 }), { abortSignal: signal }); }
    catch (error) { fail(permission(error) ? "RECOVERY_STORAGE_PERMISSION_DENIED" : "RECOVERY_STORAGE_UNAVAILABLE"); }
    const contents = page.Contents ?? [];
    if (!Array.isArray(contents) || contents.length > 1 || typeof page.IsTruncated !== "boolean") fail("RECOVERY_HISTORY_INVALID");
    if (!contents.length) {
      if (page.IsTruncated) fail("RECOVERY_HISTORY_INVALID");
      return null;
    }
    if (contents[0].Key !== this.key(sequence + 1)) fail("RECOVERY_HISTORY_INCOMPLETE");
    const entry = await this.get(sequence + 1, signal);
    if (!entry) fail("RECOVERY_HISTORY_INCOMPLETE");
    return entry;
  }
  async read() {
    const signal = AbortSignal.timeout(4000), keys: string[] = [], tokens = new Set<string>();
    let continuation: string | undefined;
    do {
      let page;
      try { page = await this.client.send(new ListObjectsV2Command({ ...this.target(), Prefix: this.config.prefix,
        MaxKeys: 1000, ContinuationToken: continuation }), { abortSignal: signal }); }
      catch (error) { fail(permission(error) ? "RECOVERY_STORAGE_PERMISSION_DENIED" : "RECOVERY_STORAGE_UNAVAILABLE"); }
      for (const item of page.Contents || []) {
        if (item.Key !== this.key(keys.length + 1)) fail("RECOVERY_HISTORY_INCOMPLETE");
        keys.push(item.Key);
        if (keys.length > MAX_ENTRIES) fail("RECOVERY_HISTORY_CAPACITY_REVIEW_REQUIRED");
      }
      if (typeof page.IsTruncated !== "boolean") fail("RECOVERY_HISTORY_INVALID");
      continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && (!continuation || tokens.has(continuation))) fail("RECOVERY_HISTORY_INVALID");
      if (continuation) tokens.add(continuation);
    } while (continuation);
    if (!keys.length && this.config.mode !== "enrollment") fail("RECOVERY_COVERAGE_REQUIRED");
    const entries: RecoveryEntry[] = [];
    let bytes = 0;
    // Bounded read concurrency; no application/provider startup and no write retry.
    for (let start = 0; start < keys.length; start += 8) {
      const batch = await Promise.all(keys.slice(start, start + 8).map((_, i) => this.get(start + i + 1, signal)));
      for (const entry of batch) {
        if (!entry) fail("RECOVERY_HISTORY_INCOMPLETE");
        const prior = entries.at(-1);
        if (entry.previous !== (prior?.hash || "")) fail("RECOVERY_HISTORY_INVALID");
        bytes += Buffer.byteLength(canonical(entry));
        if (bytes > MAX_HISTORY_BYTES) fail("RECOVERY_HISTORY_CAPACITY_REVIEW_REQUIRED");
        entries.push(entry);
      }
    }
    // LIST pages are not a multi-object snapshot. Append-only ordered keys make
    // them a prefix; probe its successor and stop if it advanced while reading.
    // LIST also avoids treating a missing-key GET's possible 403 as absence when
    // ListBucket permissions are restricted to this prefix. 403 is always a stop.
    if (await this.successor(entries.length, signal)) fail("RECOVERY_HISTORY_ADVANCED");
    if (entries.length && this.config.mode === "active" && entries[0].hash !== this.config.genesisHash) fail("RECOVERY_ENROLLMENT_MISMATCH");
    const head = entries.length ? { sequence: entries.length, hash: entries.at(-1)!.hash } : { sequence: 0, hash: "" };
    this.remember(head);
    return { head, entries };
  }
  async append(expected: RecoveryHead, entry: RecoveryEntry) {
    if (!Number.isSafeInteger(expected.sequence) || expected.sequence < 0 || expected.sequence >= MAX_ENTRIES ||
        !this.valid(entry, expected.sequence + 1) || entry.previous !== expected.hash ||
        (expected.sequence === 0 ? expected.hash !== "" : !/^[a-f0-9]{64}$/.test(expected.hash))) fail("RECOVERY_APPEND_INVALID");
    if ((entry.kind === "GENESIS") !== (this.config.mode === "enrollment")) fail("RECOVERY_EXPLICIT_ENROLLMENT_REQUIRED");
    const body = canonical(entry);
    if (Buffer.byteLength(body) > MAX_ENTRY_BYTES) fail("RECOVERY_HISTORY_CAPACITY_REVIEW_REQUIRED");
    const signal = AbortSignal.timeout(4000);
    if (this.config.mode === "active" && (await this.get(1, signal))?.hash !== this.config.genesisHash)
      fail("RECOVERY_ENROLLMENT_MISMATCH");
    if (expected.sequence) {
      const prior = await this.get(expected.sequence, signal);
      if (!prior || prior.hash !== expected.hash) fail("RECOVERY_HISTORY_INCOMPLETE");
    }
    const existing = await this.successor(expected.sequence, signal);
    if (existing) {
      if (canonical(existing) === body) return; // Exact operation retry, including after restart.
      fail("RECOVERY_CONCURRENT_WRITE");
    }
    try {
      await this.client.send(new PutObjectCommand({ ...this.target(), Key: this.key(entry.sequence), Body: body,
        ContentType: "application/json", ServerSideEncryption: "AES256", StorageClass: "STANDARD", IfNoneMatch: "*" }), { abortSignal: signal });
    } catch (error) {
      if (permission(error)) fail("RECOVERY_STORAGE_PERMISSION_DENIED");
      // A timeout, 409/412, disconnect or 5xx does not establish whether PUT won.
      // Resolve only the identical object. Never retry PUT or advance the sequence.
      let recorded: RecoveryEntry | null;
      try { recorded = await this.successor(expected.sequence, AbortSignal.timeout(4000)); }
      catch { fail("RECOVERY_WRITE_UNCERTAIN"); }
      if (!recorded) fail("RECOVERY_WRITE_UNCERTAIN");
      if (canonical(recorded) !== body) fail("RECOVERY_CONCURRENT_WRITE");
    }
    if (entry.sequence > this.observed.sequence) this.remember({ sequence: entry.sequence, hash: entry.hash });
  }
}

// Preparation only: no import from startup/routes, no environment mutation or
// credential retrieval on module import. AWS's default credential provider is
// resolved only when an explicitly constructed client sends an authorized call.
export function createRecoveryS3Store(config: RecoveryS3Config) {
  return new S3ProtectedDecisionStore(config, createRecoveryS3Client());
}
export function createRecoveryS3Client() {
  const client = new S3Client({ region: RECOVERY_S3_REGION, maxAttempts: 1, followRegionRedirects: false,
    endpoint: "https://s3.ca-central-1.amazonaws.com", forcePathStyle: false, ignoreConfiguredEndpointUrls: true });
  return client;
}
