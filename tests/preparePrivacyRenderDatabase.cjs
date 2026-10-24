// Apply migrations only to the explicitly named disposable Render database.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.env.PRIVACY_SYNTHETIC_DATABASE, 'yes');
assert.equal(process.env.PRIVACY_ISOLATED_RENDER, 'yes');
const url = new URL(process.env.DATABASE_URL);
assert.equal(decodeURIComponent(url.pathname), '/speedy_privacy_synthetic');
assert.notEqual(url.hostname, 'localhost');
assert.notEqual(url.hostname, '127.0.0.1');
assert.equal(process.env.PRIVACY_EXPECTED_DATABASE_HOST, url.hostname);

execFileSync(process.execPath, [
  'node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'
], { stdio: 'inherit' });
