// Test the exact unpublished Shell command. No network, database, real environment,
// terminal, lock file or application startup is used by this harness.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/services/privacyDelivery.service.ts'), 'utf8');
assert.doesNotMatch(source, /^\s*import\s/m, 'Owner test must load only the import-free adapter');
const { privacyVerificationDelivery } = require('../dist/services/privacyDelivery.service');
const doc = fs.readFileSync(path.join(root, 'docs/privacy-technical-configuration.md'), 'utf8');
const block = doc.match(/<!-- BEGIN OWNER_RESEND_COMMAND -->\s*```sh\ncd \/opt\/render\/project\/src && node <<'SPEEDY_OWNER_EMAIL'\n([\s\S]*?)\nSPEEDY_OWNER_EMAIL\n```\s*<!-- END OWNER_RESEND_COMMAND -->/);
assert.ok(block, 'Exactly documented Shell command must exist');
const script = new vm.Script(block[1], { filename: 'documented-owner-email-command.js' });
const gates = ['PRIVACY_DELETION_ENABLED', 'PRIVACY_FULFILLMENT_ENABLED', 'PRIVACY_VERIFICATION_EMAIL_ENABLED', 'PRIVACY_VERIFICATION_PHONE_ENABLED'];
const sender = 'Speedy Sweeties <no-reply@notify.speedysweeties.ca>';
const recipient = 'speedysweeties@hotmail.com';
const subject = '[TEST ONLY] Speedy Sweeties email delivery check';
const bodyText = 'Robert,\n\nThis is a single owner-authorized Speedy Sweeties delivery test.\nNo customer record was created or changed.\nThis message contains no verification code and cannot authorize account access, an order, or deletion.\nNo action or reply is required. Please report whether it arrived in Inbox or Junk.\n\nTest reference: SS-EMAIL-20261027-01';
const messageId = '00000000-0000-4000-8000-000000000001';
const markerPath = '/tmp/speedy-owner-resend-20261027-01.used';

async function run(options = {}) {
  const env = Object.freeze({ RENDER_SERVICE_ID: 'srv-d7ntlnpkh4rs73bev9q0',
    RENDER_GIT_COMMIT: '4ac2ba372ae23972ee665a77ce241c3d267ea107',
    RESEND_API_KEY: 'synthetic-resend-secret-not-live',
    ...Object.fromEntries(gates.map(k => [k, 'false'])), ...options.env });
  const before = JSON.stringify(env), calls = [], output = [], imports = [], markers = options.markers || new Set();
  let prompts = 0, lockCalls = 0, config;
  const mockProcess = { env, versions: { node: options.node || '24.22.1' }, stdout: {}, exitCode: 0 };
  const mockFs = {
    openSync(p, flags, mode) {
      if (p === '/dev/tty') { assert.equal(flags, 'r'); if (options.terminalUnavailable) throw new Error('private terminal failure'); return 10; }
      assert.equal(p, markerPath); assert.equal(flags, 'wx'); assert.equal(mode, 0o600); lockCalls++;
      if (markers.has(p) || options.lockFailure) throw new Error('private lock failure');
      markers.add(p); return 11;
    },
    closeSync(fd) { assert.equal(fd, 11); }
  };
  const context = {
    AbortController,
    process: mockProcess,
    console: { log: value => output.push(String(value)) },
    require(name) {
      imports.push(name);
      if (name === 'node:fs') return mockFs;
      if (name === 'node:tty') return { ReadStream: class { constructor(fd) { assert.equal(fd, 10); } destroy() {} on() {} } };
      if (name === 'node:readline/promises') return { createInterface: opts => { assert.equal(opts.terminal, false); return ({
        async question(q) { assert.match(q, /SEND ONE EMAIL/); prompts++; return options.answer ?? 'SEND ONE EMAIL'; }, close() {}
      }); } };
      assert.equal(name, './dist/services/privacyDelivery.service', 'No startup/database/environment imports');
      return { privacyVerificationDelivery(c, transport, reporter) {
        config = c;
        const guardedTransport = async (url, request) => {
          if (options.mutate) [url, request] = options.mutate(url, request);
          return transport(url, request);
        };
        const adapter = privacyVerificationDelivery(c, guardedTransport, reporter);
        return options.duplicate ? { async start(input) { await adapter.start(input); await adapter.start(input); } } : adapter;
      } };
    },
    async fetch(url, request) {
      calls.push({ url, request });
      if (options.failure) throw options.failure;
      return new Response(options.rawResponse ?? JSON.stringify({ id: messageId }), {
        status: options.status || 200, headers: { 'content-type': 'application/json' }
      });
    }
  };
  await script.runInNewContext(context);
  assert.equal(JSON.stringify(env), before, 'Process-local test must not mutate environment');
  assert.equal(output.join('\n').includes(env.RESEND_API_KEY || 'never-match-this'), false);
  assert.doesNotMatch(output.join('\n'), /PRIVATE_PROVIDER_BODY|private terminal failure|private lock failure|private network details/);
  return { result: JSON.parse(output.at(-1)), calls, output, prompts, lockCalls, markers, config, imports };
}

test('documented owner-only preview matches exact guarded one-request adapter transport', async () => {
  const r = await run();
  assert.equal(r.result.outcome, 'PROVIDER_ACCEPTED'); assert.equal(r.result.providerAccepted, true);
  assert.equal(r.result.messageId, messageId); assert.equal(r.result.inboxReceipt, 'NOT_VERIFIED');
  assert.equal(r.calls.length, 1); assert.equal(r.result.attempts, 1); assert.equal(r.prompts, 1);
  const { url, request } = r.calls[0];
  assert.equal(url, 'https://api.resend.com/emails'); assert.equal(request.method, 'POST');
  assert.equal(request.redirect, 'error'); assert.ok(request.signal);
  assert.equal(request.headers['Idempotency-Key'], 'privacy-owner-email-20261027-01');
  assert.deepEqual(JSON.parse(request.body), { from: sender, to: [recipient], subject, text: bodyText });
  assert.deepEqual(JSON.parse(r.output[0]), { from: sender, to: recipient, subject, text: bodyText });
  assert.ok(doc.includes('```text\n' + bodyText + '\n```'));
  assert.equal(r.config.emailEnabled, true); assert.equal(r.config.phoneEnabled, false);
  assert.equal(r.config.twilioAuthToken, '');
});

for (const [label, env] of [
  ['wrong service', { RENDER_SERVICE_ID: 'srv-synthetic-wrong' }],
  ['wrong revision', { RENDER_GIT_COMMIT: 'synthetic-wrong' }],
  ['missing existing key', { RESEND_API_KEY: undefined }],
  ['empty existing key', { RESEND_API_KEY: '' }],
  ...gates.map(key => [key, { [key]: 'true' }])
]) test(`preflight rejects ${label} before consent, marker or network`, async () => {
  const r = await run({ env }); assert.equal(r.calls.length, 0); assert.equal(r.lockCalls, 0); assert.equal(r.prompts, 0);
});

test('wrong runtime stops without a send', async () => {
  const r = await run({ node: '22.20.0' }); assert.equal(r.result.outcome, 'RUNTIME_OR_GATE_MISMATCH'); assert.equal(r.calls.length, 0);
});
for (const answer of ['no', '', 'SEND ONE EMAIL ']) test(`non-exact consent ${JSON.stringify(answer)} cancels without marking or sending`, async () => {
  const r = await run({ answer }); assert.equal(r.result.outcome, 'CANCELLED_NO_SEND'); assert.equal(r.calls.length, 0); assert.equal(r.lockCalls, 0);
});
test('missing runtime sender is expected after Save only and uses the local approved value', async () => {
  const r = await run({ env: { PRIVACY_VERIFICATION_FROM: undefined } }); assert.equal(r.config.resendFrom, sender); assert.equal(r.calls.length, 1);
});
test('stale runtime sender remains untouched', async () => {
  const r = await run({ env: { PRIVACY_VERIFICATION_FROM: 'old@example.invalid' } }); assert.equal(r.config.resendFrom, sender); assert.equal(r.calls.length, 1);
});
test('repeat invocation on the same instance is blocked by the retained marker', async () => {
  const markers = new Set(); await run({ markers }); const r = await run({ markers });
  assert.equal(r.result.outcome, 'ATTEMPT_LOCK_EXISTS_OR_UNAVAILABLE'); assert.equal(r.calls.length, 0);
});
test('unavailable marker prevents a request', async () => {
  const r = await run({ lockFailure: true }); assert.equal(r.calls.length, 0); assert.equal(r.result.outcome, 'ATTEMPT_LOCK_EXISTS_OR_UNAVAILABLE');
});
test('unavailable terminal never sends', async () => {
  const r = await run({ terminalUnavailable: true }); assert.equal(r.calls.length, 0); assert.equal(r.lockCalls, 0);
});
test('duplicate adapter invocation cannot make a second provider request', async () => {
  const r = await run({ duplicate: true }); assert.equal(r.calls.length, 1); assert.equal(r.result.outcome, 'SECOND_ATTEMPT_BLOCKED');
});
for (const name of ['TypeError', 'TimeoutError', 'AbortError']) test(`${name} has unknown outcome, no retry and no private error output`, async () => {
  const failure = new Error('private network details'); failure.name = name;
  const r = await run({ failure }); assert.equal(r.calls.length, 1); assert.equal(r.result.providerAccepted, null);
  assert.equal(r.result.outcome, 'NETWORK_OR_TIMEOUT_OUTCOME_UNKNOWN'); assert.ok(r.markers.has(markerPath));
});
test('provider rejection reports status but no private response body', async () => {
  const r = await run({ status: 403, rawResponse: JSON.stringify({ message: 'PRIVATE_PROVIDER_BODY', id: messageId }) });
  assert.equal(r.calls.length, 1); assert.equal(r.result.httpStatus, 403); assert.equal(r.result.providerAccepted, false); assert.equal(r.result.messageId, null);
});
for (const rawResponse of ['not json PRIVATE_PROVIDER_BODY', '{}', '{"id":"PRIVATE_PROVIDER_BODY"}']) test('malformed success does not prove acceptance or print body', async () => {
  const r = await run({ rawResponse }); assert.equal(r.calls.length, 1); assert.equal(r.result.outcome, 'SUCCESS_RESPONSE_UNCONFIRMED'); assert.equal(r.result.providerAccepted, null);
});
for (const [label, mutate] of [
  ['unexpected URL', (u,o) => ['https://example.invalid',o]],
  ['wrong method', (u,o) => [u,{...o,method:'GET'}]],
  ['wrong recipient', (u,o) => [u,{...o,body:JSON.stringify({...JSON.parse(o.body),to:['other@example.invalid']})}]],
  ['extra recipient field', (u,o) => [u,{...o,body:JSON.stringify({...JSON.parse(o.body),bcc:['other@example.invalid']})}]],
  ['wrong sender', (u,o) => [u,{...o,body:JSON.stringify({...JSON.parse(o.body),from:'other@example.invalid'})}]],
  ['changed idempotency', (u,o) => [u,{...o,headers:{...o.headers,'Idempotency-Key':'different'}}]],
  ['missing timeout', (u,o) => [u,{...o,signal:undefined}]]
]) test(`request guard blocks ${label} without network`, async () => {
  const r = await run({ mutate }); assert.equal(r.calls.length, 0); assert.equal(r.result.outcome, 'REQUEST_GUARD_FAILED');
});
