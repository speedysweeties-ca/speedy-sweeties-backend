const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
function target() {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.PRIVACY_SYNTHETIC_DATABASE, 'yes');
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.equal(url.pathname, '/speedy_privacy_synthetic');
  assert.equal(url.username, 'privacy_test');
  const container = process.env.RECOVERY_POSTGRES_CONTAINER_ID;
  assert.match(container || '', /^[a-f0-9]{12,64}$/);
  // Bind Docker's target to the same explicit synthetic database identity as Prisma.
  const identity = execFileSync('docker', ['exec', container, 'psql', '-U', 'privacy_test', '-d', 'speedy_privacy_synthetic', '-Atc',
    "SELECT current_database() || ':' || current_user"], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assert.equal(identity, 'speedy_privacy_synthetic:privacy_test');
  return container;
}
async function contents(db, fixtures) {
  for (const [table, ids] of [['customer', fixtures.customers], ['order', fixtures.orders]]) {
    for (const row of await db[table].findMany({ select: { id: true } })) assert.ok(ids.has(row.id), 'Non-fixture row: STOP');
  }
  const tables = await db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  const allowed = new Set(['Customer', 'Order', 'OrderItem', 'DigitalReceipt', 'DeliveryHelpRequest', 'PrivacyChallenge',
    'PrivacyAccessCredential', 'PrivacyDeletionRequest', 'PrivacyAudit', 'PrivacyExternalTask', 'PrivacyDeletedIdentity']);
  for (const { tablename } of tables) if (!allowed.has(tablename)) {
    assert.match(tablename, /^[A-Za-z_]+$/);
    const [{ count }] = await db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "${tablename}"`);
    assert.equal(count, 0, 'Unexpected populated table: STOP');
  }
  assert.equal(await db.order.count(), fixtures.orders.size);
  for (const r of await db.privacyDeletionRequest.findMany({ select: { id: true, subjectId: true, sourceOrderId: true } })) {
    assert.ok(fixtures.orders.has(r.sourceOrderId), 'Unknown privacy request source: STOP');
    assert.ok(r.subjectId === null || fixtures.customers.has(r.subjectId), 'Unknown privacy subject: STOP');
  }
  for (const r of await db.privacyChallenge.findMany({ select: { sourceOrderId: true } }))
    assert.ok(fixtures.orders.has(r.sourceOrderId), 'Unknown challenge source: STOP');
  for (const r of await db.privacyAccessCredential.findMany({ select: { customerId: true, sourceOrderId: true } }))
    assert.ok(fixtures.customers.has(r.customerId) && fixtures.orders.has(r.sourceOrderId), 'Unknown access scope: STOP');
  for (const r of await db.privacyDeletedIdentity.findMany({ select: { phoneHash: true } }))
    assert.ok(fixtures.phoneHashes.has(r.phoneHash), 'Unknown marker: STOP');
}
async function dump(db, fixtures) {
  const container = target(); await contents(db, fixtures);
  return execFileSync('docker', ['exec', container, 'pg_dump', '-U', 'privacy_test', '-d', 'speedy_privacy_synthetic', '--format=custom'],
    { maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
async function restore(db, fixtures, snapshot) {
  const container = target(); await contents(db, fixtures);
  await db.$disconnect();
  execFileSync('docker', ['exec', '-i', container, 'pg_restore', '-U', 'privacy_test', '-d', 'speedy_privacy_synthetic',
    '--clean', '--if-exists', '--exit-on-error', '--no-owner', '--no-privileges', '--single-transaction'],
    { input: snapshot, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  await db.$connect();
}
module.exports = { dump, restore };
