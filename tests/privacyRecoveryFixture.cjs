// Memory storage is ONLY a synthetic test double, never a production solution.
const assert = require('node:assert/strict');
class SyntheticDecisionStore {
  constructor() { this.head = { sequence: 0, hash: '' }; this.entries = []; this.failKind = null; }
  async read() { return structuredClone({ head: this.head, entries: this.entries }); }
  async append(expected, entry) {
    if (entry.kind === this.failKind) throw new Error('synthetic storage outage');
    assert.deepEqual(expected, this.head, 'Synthetic CAS rejects concurrent append');
    this.entries.push(JSON.parse(JSON.stringify(entry)));
    this.head = { sequence: entry.sequence, hash: entry.hash };
  }
}
async function syntheticJournal(key, db) {
  assert.equal(process.env.NODE_ENV, 'test');
  const { PrivacyRecoveryJournal } = require('../dist/services/privacyRecoveryJournal');
  const store = new SyntheticDecisionStore();
  const journal = new PrivacyRecoveryJournal(store, 'synthetic-privacy-fixture-only', key);
  // Legacy lifecycle suites share a DB but own distinct test fixtures. Their mock
  // baseline is NOT a coverage/restore claim; the new recovery suite uses real db.
  const empty = { count: async () => 0 };
  await journal.enrollEmptyDatabase(db || { privacyDeletionRequest: empty, privacyDeletedIdentity: empty, privacyAudit: empty, privacyExternalTask: empty });
  return journal;
}
module.exports = { SyntheticDecisionStore, syntheticJournal };
