const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const {
  askHidden,
  normalizeCanadianPhone,
  askCanadianPhone,
  isolatedPreflight
} = require('./privacyIsolatedClient.cjs');
const { ISOLATED_ROUTES, createControlAuthorizer } = require('./privacyIsolatedContract.cjs');

const terminal = () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const writes = [];
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = value => { input.isRaw = value; };
  output.on('data', chunk => writes.push(chunk.toString('utf8')));
  return { input, output, text: () => writes.join('') };
};

test('hidden input suppresses pasted text, including bracketed paste', async () => {
  const io = terminal();
  const answer = askHidden('Private: ', io.input, io.output);
  io.input.write('\u001b[200~private-value\u001b[201~\r');
  assert.equal(await answer, 'private-value');
  assert.equal(io.text(), 'Private: \n');
  assert.equal(io.input.isRaw, false);
});

test('Canadian phone input normalizes ten digits and an optional country code', () => {
  assert.equal(normalizeCanadianPhone('(519) 555-0123'), '+15195550123');
  assert.equal(normalizeCanadianPhone('+1 519 555 0123'), '+15195550123');
  assert.equal(normalizeCanadianPhone('519555012'), null);
  assert.equal(normalizeCanadianPhone('private-number'), null);
});

test('invalid phone input retries without echoing private input', async () => {
  const io = terminal();
  const answer = askCanadianPhone(io.input, io.output);
  io.input.write('\u001b[200~private-number\u001b[201~\r');
  await new Promise(resolve => setImmediate(resolve));
  io.input.write('5195550123\r');
  assert.equal(await answer, '+15195550123');
  assert.doesNotMatch(io.text(), /private-number|5195550123/);
  assert.match(io.text(), /Invalid Canadian phone format/);
  assert.match(io.text(), /Nothing was sent/);
});

test('client preflight uses the deployed authenticated GET route before fixture creation', async () => {
  const calls = [];
  const result = await isolatedPreflight(
    new URL('https://isolated.example.invalid/ignored'),
    'synthetic-control-secret',
    async (url, options) => {
      calls.push({ url: url.toString(), options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ready: true, fixtureCreated: false, verificationChannel: 'PHONE', phoneVerificationEnabled: true,
          emailVerificationEnabled: false, fulfillmentEnabled: false
        })
      };
    }
  );
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, ISOLATED_ROUTES.preflight);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers.authorization, 'Bearer synthetic-control-secret');
  assert.equal(result.fixtureCreated, false);
  assert.equal(result.fulfillmentEnabled, false);
});

test('invalid control-secret authentication intentionally returns sanitized 404', () => {
  const authorize = createControlAuthorizer('expected-synthetic-control-secret');
  let status;
  let body;
  authorize(
    { headers: { authorization: 'Bearer rejected-private-input' } },
    {
      status(value) { status = value; return this; },
      json(value) { body = value; },
      set() { assert.fail('invalid authentication must not reach the success path'); }
    },
    () => assert.fail('invalid authentication must not call next')
  );
  assert.equal(status, 404);
  assert.deepEqual(body, { code: 'NOT_FOUND' });
  assert.doesNotMatch(JSON.stringify(body), /rejected-private-input/);
});
