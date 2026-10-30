// Writes only the synthetic tracking credential into the booted simulator app container.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { execFileSync } = require('node:child_process');
const { recordPath, ALLOWED_ORIGIN } = require('./privacyIsolatedEmailFixture.cjs');

const bundleID = 'ca.speedysweeties.Speedy-Sweeties-Customer-iOS';
const ask = label => new Promise(resolve => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl.question(label, answer => { rl.close(); resolve(answer.trim()); });
});

const importPayload = record => {
  assert.equal(record.version, 1); assert.equal(record.channel, 'EMAIL');
  assert.equal(record.baseURL, ALLOWED_ORIGIN);
  assert.match(record.trackingToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(record.orderId, /^[0-9a-f-]{36}$/i);
  return { version: 1, armedForOneEmail: true, orderId: record.orderId, trackingToken: record.trackingToken };
};

const writeImport = (container, payload) => {
  const directory = path.join(container, 'Library', 'Application Support', 'SpeedyPrivacyTest');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, 'isolated-email-import.json');
  const handle = fs.openSync(target, 'wx', 0o600);
  try { fs.writeFileSync(handle, JSON.stringify(payload)); }
  finally { fs.closeSync(handle); }
  assert.equal(fs.statSync(target).mode & 0o077, 0);
  return target;
};

const run = async () => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('An interactive terminal is required');
  const record = JSON.parse(fs.readFileSync(recordPath(), 'utf8'));
  const authorization = await ask('Type ARM ONE EMAIL to prepare the simulator (this does not send it): ');
  assert.equal(authorization, 'ARM ONE EMAIL', 'One-email arming was not authorized');
  const container = execFileSync('xcrun', ['simctl', 'get_app_container', 'booted', bundleID, 'data'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  assert.ok(container && path.isAbsolute(container), 'Booted simulator app container unavailable');
  writeImport(container, importPayload(record));
  console.log(JSON.stringify({ simulatorImportSaved: true, armedForOneEmail: true, messagesSent: 0 }));
};

if (require.main === module) run().catch(error => {
  console.error(`Simulator bootstrap stopped: ${error.message}`); process.exitCode = 1;
});

module.exports = { importPayload, writeImport };
