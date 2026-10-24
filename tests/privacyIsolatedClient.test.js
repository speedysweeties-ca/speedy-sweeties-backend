const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const {
  askHidden,
  normalizeCanadianPhone,
  askCanadianPhone
} = require('./privacyIsolatedClient.cjs');

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
