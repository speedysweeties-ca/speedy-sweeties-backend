// Build a disposable pre-feature baseline from the checked-in schema. Historical
// migrations omit dispatchedAt and other fields already present in production.
// Test this feature's real migration against that baseline without changing old
// migrations or touching any external database.
const { readFileSync, writeFileSync, mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.CI, 'true');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.equal(url.pathname, '/speedy_sweeties_ci');
const source = readFileSync('prisma/schema.prisma', 'utf8');
const baseline = source.replace(/^  dispatchEditPauses\s+OrderEditPause\[\]\n/m, '')
  .replace(/model OrderEditPause \{[\s\S]*?\n\}/, '');
assert.ok(!baseline.includes('OrderEditPause'));
const schema = join(mkdtempSync(join(tmpdir(), 'edit-pause-ci-')), 'schema.prisma');
writeFileSync(schema, baseline);
execFileSync('npx', ['--no-install', 'prisma', 'db', 'push', '--schema', schema, '--skip-generate'], { stdio: 'inherit' });
execFileSync('npx', ['--no-install', 'prisma', 'db', 'execute', '--schema', 'prisma/schema.prisma',
  '--file', 'prisma/migrations/20261021220000_add_order_edit_pauses/migration.sql'], { stdio: 'inherit' });
