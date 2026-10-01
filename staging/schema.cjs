const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { assertStaging } = require('./guard.cjs');
const STAGING_SCHEMA = 'ordering_staging_v1';
function isolatedDatabaseUrl(env = process.env) {
  assertStaging(env);
  const url = new URL(env.DATABASE_URL);
  url.searchParams.set('schema', STAGING_SCHEMA);
  return url.toString();
}
function prepareSchema() {
  // Historical production migrations do not fully reconstruct today's Prisma model.
  // Use a new namespace inside the pinned, separate staging database only.
  process.env.DATABASE_URL = isolatedDatabaseUrl();
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', path.join(__dirname, '..', 'prisma', 'schema.prisma')], {
    env: process.env, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) {
    const detail = `${result.stdout || ''}\n${result.stderr || ''}`.replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[database URL redacted]');
    console.error(detail.slice(-4000));
    throw new Error('Isolated staging schema preparation failed');
  }
  console.log(`Canonical staging schema ready: ${STAGING_SCHEMA}`);
}
module.exports = { STAGING_SCHEMA, isolatedDatabaseUrl, prepareSchema };
