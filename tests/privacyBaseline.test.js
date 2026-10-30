const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const {
  BASELINE_COMMIT,
  PRIVACY_MIGRATIONS,
  materializePinnedBaselineSchema,
  applyPinnedBaselineAndPrivacyMigrations,
} = require('./privacyBaseline.cjs');

test('privacy baseline is pinned before privacy models and includes receipt evidence', () => {
  const path = materializePinnedBaselineSchema();
  const schema = readFileSync(path, 'utf8');
  assert.equal(BASELINE_COMMIT, '12b78cc4780c96efa286c167c63ac1676dfc5dbb');
  assert.match(schema, /model DigitalReceipt\s*\{/);
  assert.doesNotMatch(schema, /model PrivacyDeletionRequest\s*\{/);
});
test('synthetic migration evidence is recorded only after actual successful SQL and cannot repair an existing/failed ledger', () => {
 const prior={...process.env};process.env.NODE_ENV='test';process.env.PRIVACY_SYNTHETIC_DATABASE='yes';
 process.env.DATABASE_URL='postgresql://privacy_test:synthetic-only@127.0.0.1/speedy_privacy_synthetic';
 try {
  const calls=[];applyPinnedBaselineAndPrivacyMigrations(materializePinnedBaselineSchema(),{recordExecutedSql:true,execute:(_exe,args,options)=>{calls.push({args,options});}});
  assert.match(calls[0].options.input,/ledger must be absent/);
  for(const m of PRIVACY_MIGRATIONS){const applied=calls.findIndex(c=>c.args.includes('--applied')&&c.args.includes(m));
   assert(applied>0);assert(calls[applied-1].args.includes('--file'));assert(calls[applied-1].args.includes(`prisma/migrations/${m}/migration.sql`));}
  const failed=[];assert.throws(()=>applyPinnedBaselineAndPrivacyMigrations(materializePinnedBaselineSchema(),{recordExecutedSql:true,execute:(_exe,args)=>{
   failed.push(args);if(args.includes('--file'))throw Error('Synthetic SQL failed');
  }}),/SQL failed/);assert(!failed.some(a=>a.includes('--applied')));
  assert.throws(()=>applyPinnedBaselineAndPrivacyMigrations(materializePinnedBaselineSchema(),{recordExecutedSql:true,execute:()=>{throw Error('Existing synthetic ledger');}}),/Existing synthetic ledger/);
  process.env.DATABASE_URL='postgresql://privacy_test:synthetic-only@production.invalid/speedy_privacy_synthetic';
  assert.throws(()=>applyPinnedBaselineAndPrivacyMigrations(materializePinnedBaselineSchema(),{recordExecutedSql:true,execute:()=>assert.fail('Wrong target touched')}));
 } finally { for(const k of ['NODE_ENV','PRIVACY_SYNTHETIC_DATABASE','DATABASE_URL']){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];} }
});

test('privacy migrations are applied in their reviewed order', () => {
  assert.deepEqual(PRIVACY_MIGRATIONS, [
    '20261023030000_customer_privacy_requests',
    '20261023150000_privacy_access_credentials',
    '20261023190000_adopt_retention_policy',
    '20261023220000_approved_privacy_review_dates',
    '20261030160000_retention_sms_delivery',
  ]);
});
