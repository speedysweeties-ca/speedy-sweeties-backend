process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://privacy_test:synthetic-only@127.0.0.1:5432/speedy_privacy_synthetic';
process.env.JWT_SECRET = 'synthetic-recovery-jwt';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { syntheticJournal, SyntheticDecisionStore } = require('./privacyRecoveryFixture.cjs');
const { PrivacyRecoveryJournal } = require('../dist/services/privacyRecoveryJournal');
const { PrivacyDeletionService } = require('../dist/services/privacyDeletion.service');
const { reconcileSyntheticRestore } = require('../dist/services/privacyRecovery.service');
const key = 'synthetic-recovery-key-distinct';

test('journal requires coverage and rejects existing decisions during enrollment', async () => {
  const journal = new PrivacyRecoveryJournal(new SyntheticDecisionStore(), 'synthetic', key);
  await assert.rejects(journal.ready(), /COVERAGE_REQUIRED/);
  await assert.rejects(journal.enrollEmptyDatabase({ privacyDeletionRequest: { count: async () => 1 } }), /EXISTING_DECISIONS/);
});
test('protected high-water, chain, key and unresolved intents fail closed', async () => {
  const journal = await syntheticJournal(key);
  const intent = await journal.intent((await journal.ready()).head, 'SYNTHETIC', { request: { id: 'fixture' } });
  await assert.rejects(journal.ready(), /UNFINISHED_OPERATION/);
  await journal.committed(intent);
  assert.equal((await journal.ready()).cases.size, 1);
  const saved = await journal.store.read();
  journal.store.entries.pop();
  await assert.rejects(journal.ready(), /INCOMPLETE/);
  journal.store.entries = structuredClone(saved.entries);
  journal.store.entries.splice(1, 1);
  await assert.rejects(journal.ready(), /HISTORY_INVALID/);
  journal.store.entries = structuredClone(saved.entries);
  journal.store.entries[1].payload.state.request.id = 'tampered';
  await assert.rejects(journal.ready(), /HISTORY_INVALID/);
  journal.store.entries = structuredClone(saved.entries);
  await assert.rejects(new PrivacyRecoveryJournal(journal.store, journal.scope, 'synthetic-wrong-key-value').ready(), /HISTORY_INVALID/);
  await assert.rejects(new PrivacyRecoveryJournal(journal.store, 'wrong-scope', key).ready(), /HISTORY_INVALID/);
});
test('CAS prevents racing writers and failed commit acknowledgement stays unresolved', async () => {
  const journal = await syntheticJournal(key), head = (await journal.ready()).head;
  const first = await journal.intent(head, 'SYNTHETIC', { request: { id: 'one' } });
  await assert.rejects(journal.intent(head, 'SYNTHETIC', { request: { id: 'two' } }));
  journal.store.failKind = 'COMMIT';
  await assert.rejects(journal.committed(first));
  await assert.rejects(journal.ready(), /UNFINISHED_OPERATION/);
});
test('production privacy flow cannot mutate or deliver without a protected store', async () => {
  const service = new PrivacyDeletionService({}, key, { start() { assert.fail('No delivery'); } }, () => false, 'test', '12-31');
  await assert.rejects(service.challenge({}, 'synthetic'), /RECOVERY_STORE_REQUIRED/);
  await assert.rejects(service.verify('synthetic', '123456'), /RECOVERY_STORE_REQUIRED/);
  await assert.rejects(service.submit({ id: 'synthetic' }), /RECOVERY_STORE_REQUIRED/);
  await assert.rejects(service.cancel('synthetic', 'synthetic'), /RECOVERY_STORE_REQUIRED/);
});
test('wrong recovery targets fail before any database operation', async () => {
  process.env.PRIVACY_SYNTHETIC_DATABASE = 'yes';
  const forbidden = new Proxy({}, { get() { assert.fail('Wrong target touched database'); } });
  for (const url of ['postgresql://privacy_test:synthetic-only@production.example/speedy_privacy_synthetic',
    'postgresql://privacy_test:synthetic-only@127.0.0.1/speedy_sweeties_db',
    'postgresql://other:synthetic-only@127.0.0.1/speedy_privacy_synthetic']) {
    await assert.rejects(reconcileSyntheticRestore({ db: forbidden }, url, key), /TARGET_REJECTED/);
  }
  delete process.env.PRIVACY_SYNTHETIC_DATABASE;
});
