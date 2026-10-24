// Destructive schema setup is limited to a named, loopback synthetic database.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.env.PRIVACY_SYNTHETIC_DATABASE, 'yes');
const url = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.equal(url.pathname, '/speedy_privacy_synthetic');
// The pre-feature schema is pinned, not derived from a possibly advancing main.
const baseline = execFileSync('git', ['show', '12b78cc4780c96efa286c167c63ac1676dfc5dbb:prisma/schema.prisma'], { encoding: 'utf8' });
const path = join(mkdtempSync(join(tmpdir(), 'privacy-baseline-')), 'schema.prisma');
writeFileSync(path, baseline);
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--schema', path, '--skip-generate'], { stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'execute', '--schema', 'prisma/schema.prisma', '--file', 'prisma/migrations/20261023030000_customer_privacy_requests/migration.sql'], { stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'execute', '--schema', 'prisma/schema.prisma', '--file', 'prisma/migrations/20261023150000_privacy_access_credentials/migration.sql'], { stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'execute', '--schema', 'prisma/schema.prisma', '--file', 'prisma/migrations/20261023190000_adopt_retention_policy/migration.sql'], { stdio: 'inherit' });
