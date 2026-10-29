process.env.NODE_ENV='test';
process.env.DATABASE_URL='postgresql://privacy_test:synthetic-only@127.0.0.1/speedy_privacy_synthetic';
process.env.JWT_SECRET='synthetic-operator-jwt';process.env.FIREBASE_SERVICE_ACCOUNT_JSON='{}';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {PrivacyRecoveryJournal}=require('../dist/services/privacyRecoveryJournal');
const {PrivacyDeletionService}=require('../dist/services/privacyDeletion.service');
const {runPrivacyOperator,validateOperatorApproval}=require('../dist/services/privacyRecoveryOperator');
const {scopedRecoveryEvidence}=require('../dist/services/privacyRecoveryEvidence');
const {SyntheticDecisionStore}=require('./privacyRecoveryFixture.cjs');
const key='synthetic-operator-stable-key-not-jwt-at-least-32';
const now=Date.parse('2026-10-29T14:00:00Z'),revision='a'.repeat(40);
const migrations=['20261023030000_customer_privacy_requests','20261023150000_privacy_access_credentials','20261023190000_adopt_retention_policy','20261023220000_approved_privacy_review_dates'];
function fixture(){
 const approval={format:1,operation:'enrollment',workspaceId:'tea-d7loaul7vvec73cme5d0',serviceId:'srv-d7ntlnpkh4rs73bev9q0',resourceId:'dpg-d7m33g2qqhas73f58hrg-a',
  hostname:'dpg-d7m33g2qqhas73f58hrg-a.ohio-postgres.render.com',databaseName:'speedy_sweeties_db',databaseUser:'synthetic_expected_role',sourceRevision:revision,
  ownerAccountId:'080413009273',bucket:'speedy-sweeties-privacy-decisions-080413009273',region:'ca-central-1',prefix:'production/epoch-0001/',scope:'speedy-privacy-production-epoch-0001',
  operatorArn:'arn:aws:sts::080413009273:assumed-role/ExistingSyntheticOperator/mfa-session',awsProfile:'existing-synthetic-operator',
  mfa:{reference:'review:mfa-evidence',verifiedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString()},
  exclusion:{reference:'review:all-writers-stopped',allWritersStopped:true,verifiedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString()},
  pinRecordReference:'protected:synthetic-record',approvedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString()};
 const store=new SyntheticDecisionStore();const journal=new PrivacyRecoveryJournal(store,approval.scope,key);
 const model=()=>({count:async()=>0,findMany:async()=>[],findUnique:async()=>null});
 const tx={};for(const m of ['privacyDeletionRequest','privacyDeletedIdentity','privacyAudit','privacyExternalTask','privacyChallenge','privacyAccessCredential','customer','order','retentionMessage','dispatchEvent','orderEditPause','orderPickupStop','deliveryCheckInEvent'])tx[m]=model();
 const state={baseline:0,digest:'before',sql:[],targetCalls:0,dbCalls:0,clock:now};
 tx.$executeRawUnsafe=async q=>{state.sql.push(q);return 0;};tx.$executeRaw=async q=>{state.sql.push(q.join('?'));return 0;};
 tx.$queryRawUnsafe=async q=>{assert.match(q,/^SELECT count\(\*\)::text/);return[{count:'0',digest:state.digest}];};
 tx.$queryRaw=async q=>{const s=q.join('?');
  if(s.includes('current_database()'))return[{name:approval.databaseName,owner:approval.databaseUser}];
  if(s.includes('SELECT t.tgname,c.relname')){
   const sql=require('node:fs').readFileSync(require('node:path').join(__dirname,'../prisma/migrations/20261023030000_customer_privacy_requests/migration.sql'),'utf8');
   const bodies=new Map([...sql.matchAll(/CREATE FUNCTION (privacy_[a-z_]+)\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$([\s\S]*?)\$\$;/g)].map(m=>[m[1],m[2]]));
   return [['privacy_retained_order_guard','Order',27,'privacy_retained_order_guard'],['privacy_receipt_guard','DigitalReceipt',31,'privacy_retained_child_guard'],['privacy_item_guard','OrderItem',31,'privacy_retained_child_guard'],['privacy_help_guard','DeliveryHelpRequest',23,'privacy_retained_child_guard']].map(([tgname,relname,tgtype,proname])=>({tgname,relname,tgtype,tgenabled:'O',proname,prosrc:bodies.get(proname)}));
  }
  if(s.includes('information_schema.columns')||s.includes('pg_get_triggerdef')||s.includes('FROM pg_constraint'))return[];
  if(s.includes('WHERE finished_at IS NULL'))return[{count:0}];
  if(s.includes('SELECT migration_name'))return migrations.map(m=>({migration_name:m,finished_at:new Date(now-60000)}));
  if(s.includes('FROM pg_tables'))return[{tablename:'Customer'},{tablename:'PrivacyDeletionRequest'}];
  if(s.includes("'challenge' AS kind"))return Array.from({length:9},(_,i)=>({kind:String(i),count:i===0?state.baseline:0}));
  throw Error('Unreviewed synthetic query');};
 let tail=Promise.resolve();const db={$transaction(work){state.dbCalls++;const next=tail.then(()=>work(tx));tail=next.catch(()=>{});return next;}};
 const service=new PrivacyDeletionService(db,key,{start(){assert.fail('delivery');}},()=>false,'Synthetic timeframe','12-31',journal);
 const deps={db,service,journal,digestKey:key,databaseUrl:`postgresql://${approval.databaseUser}:synthetic-secret@${approval.hostname}/${approval.databaseName}?sslmode=require`,
  sourceRevision:revision,now:()=>state.clock,verifyTarget:async()=>{state.targetCalls++;return{...approval,status:'available'};},
  identity:async()=>({Account:approval.ownerAccountId,Arn:approval.operatorArn}),
  versions:async()=>store.entries.map(e=>({key:approval.prefix+String(e.sequence).padStart(16,'0')+'.json',latest:true,marker:false}))};
 return{approval,store,journal,deps,tx,state};
}
test('operator rejects mismatched exact targets, unauthorized execution and stale/exclusion/MFA approvals before database access',async()=>{
 for(const patch of [{resourceId:'dpg-dbe37v59fdbs73961o3g-a'},{workspaceId:'wrong'},{ownerAccountId:'111122223333'},
  {operatorArn:'arn:aws:iam::080413009273:user/SpeedyPrivacyJournalApplication'},{mfa:{}},{exclusion:{allWritersStopped:false}},{sourceRevision:'b'.repeat(40)}]){
  const f=fixture();await assert.rejects(runPrivacyOperator({...f.approval,...patch},'preflight',f.deps));assert.equal(f.state.dbCalls,0);assert.equal(f.store.entries.length,0);
 }
 const f=fixture();await assert.rejects(runPrivacyOperator(f.approval,'enroll',f.deps),/EXPLICIT_AUTHORIZATION/);assert.equal(f.state.targetCalls,0);
 await assert.rejects(runPrivacyOperator(f.approval,'preflight',{...f.deps,databaseUrl:f.deps.databaseUrl.replace('dpg-d7m33g2qqhas73f58hrg-a.','dpg-dbe37v59fdbs73961o3g-a.')}),/TARGET_REJECTED/);
 f.state.clock+=3600000;await assert.rejects(runPrivacyOperator(f.approval,'preflight',f.deps),/EXPIRED/);
});
test('provider and actual database identity must both match, before a journal write',async()=>{
 const f=fixture();await assert.rejects(runPrivacyOperator(f.approval,'preflight',{...f.deps,identity:async()=>({Account:'080413009273',Arn:'wrong'})}),/TARGET_REJECTED/);assert.equal(f.state.dbCalls,0);
 f.tx.$queryRaw=async()=>[{name:'wrong',owner:'wrong'}];await assert.rejects(runPrivacyOperator(f.approval,'preflight',f.deps),/TARGET_REJECTED/);assert.equal(f.store.entries.length,0);
});
test('read-only preflight checks all nine baseline indicators, writes nothing and binds the plan',async()=>{
 const f=fixture();const r=await runPrivacyOperator(f.approval,'preflight',f.deps);
 assert.equal(r.result,'REVIEW_PLAN');assert.equal(r.writes,0);assert.equal(r.trafficMayReopen,false);assert.match(r.plan.planDigest,/^[a-f0-9]{64}$/);
 assert(f.state.sql[0].includes('REPEATABLE READ READ ONLY'));assert(!f.state.sql.some(q=>q.startsWith('LOCK TABLE')));assert.equal(f.store.entries.length,0);
 f.state.baseline=1;await assert.rejects(runPrivacyOperator(f.approval,'preflight',f.deps),/NONEMPTY_BASELINE/);
});
test('enrollment is explicit, locks before baseline, rejects changed/forged plans and creates one entry under concurrency',async()=>{
 const f=fixture(),plan=(await runPrivacyOperator(f.approval,'preflight',f.deps)).plan;
 f.state.digest='changed';await assert.rejects(runPrivacyOperator(f.approval,'enroll',f.deps,plan,true),/STALE_PLAN/);assert.equal(f.store.entries.length,0);f.state.digest='before';
 await assert.rejects(runPrivacyOperator(f.approval,'enroll',f.deps,{...plan,databaseDigest:'forged'},true),/STALE_PLAN/);
 const both=await Promise.all([runPrivacyOperator(f.approval,'enroll',f.deps,plan,true),runPrivacyOperator(f.approval,'enroll',f.deps,plan,true)]);
 assert.deepEqual(both.map(r=>r.result),['ENROLLMENT_RECORDED','ENROLLMENT_ALREADY_RECORDED']);assert.equal(f.store.entries.length,1);
 assert.equal(both[0].pins.PRIVACY_RECOVERY_ENROLLMENT_HASH,(await f.journal.ready()).enrollmentHash);
 assert(f.state.sql.some(q=>q.includes('ACCESS EXCLUSIVE MODE')));assert(f.state.sql.some(q=>q==='SET TRANSACTION ISOLATION LEVEL READ COMMITTED'));
 const again=await runPrivacyOperator(f.approval,'preflight',f.deps);assert.equal(again.result,'ENROLLMENT_ALREADY_RECORDED');assert.equal(again.writes,0);
});
test('an accepted enrollment with a lost acknowledgement is authenticated without another append; missing outcome stops',async()=>{
 const f=fixture(),plan=(await runPrivacyOperator(f.approval,'preflight',f.deps)).plan;
 let writes=0;const original=f.store.append.bind(f.store);f.store.append=async(...args)=>{writes++;await original(...args);throw Error('PRIVATE_TRANSPORT_DETAIL');};
 const r=await runPrivacyOperator(f.approval,'enroll',f.deps,plan,true);assert.equal(r.result,'ENROLLMENT_ACKNOWLEDGEMENT_RECOVERED');assert.equal(writes,1);
 const g=fixture(),p=(await runPrivacyOperator(g.approval,'preflight',g.deps)).plan;g.store.failKind='GENESIS';
 await assert.rejects(runPrivacyOperator(g.approval,'enroll',g.deps,p,true),/WRITE_UNCERTAIN/);assert.equal(g.store.entries.length,0);
});
async function pendingFixture(outcome){
 const f=fixture();await f.journal.enrollEmptyDatabase(f.tx);
 f.approval.operation='resolve';f.approval.enrollmentHash=(await f.journal.ready()).enrollmentHash;
 f.approval.originalDatabaseNotRestoredSinceIntent=true;f.approval.outcomeEvidenceReference='review:original-db-outcome';
 const scope={subjectId:'synthetic-customer',orders:[],phoneHash:'synthetic-phone-hash'};
 const before={id:'synthetic-request',status:'SUBMITTED'},after={...before,status:'CANCELLED'};let request=before;
 f.tx.privacyDeletionRequest.findUnique=async()=>request;
 const beforeEvidenceDigest=await scopedRecoveryEvidence(f.tx,f.journal,before.id,scope);request=after;
 const afterEvidenceDigest=await scopedRecoveryEvidence(f.tx,f.journal,before.id,scope);
 await f.journal.intent((await f.journal.ready()).head,'CANCEL',{request:after,scope,tasks:[]},{beforeEvidenceDigest,afterEvidenceDigest});
 request=outcome==='COMMITTED'?after:outcome==='NOT_COMMITTED'?before:{...before,status:'HOLD'};
 return{...f,setRequest:r=>{request=r;},before,after};
}
test('interrupted INTENT resolves only exact original DB before/after evidence, with authenticated appended outcome and legacy compatibility',async()=>{
 for(const outcome of ['COMMITTED','NOT_COMMITTED']){
  const f=await pendingFixture(outcome);await assert.rejects(f.journal.ready(),/UNFINISHED_OPERATION/);
  const p=(await runPrivacyOperator(f.approval,'preflight',f.deps)).plan;assert.equal(p.outcome,outcome);
  const r=await runPrivacyOperator(f.approval,'resolve',f.deps,p,true);assert.equal(r.result,'OPERATION_RESOLVED');assert.equal(r.outcome,outcome);
  assert.equal((await f.journal.ready()).cases.size,outcome==='COMMITTED'?1:0);assert.equal(f.store.entries.at(-1).kind,'RESOLVE');
  const again=await runPrivacyOperator(f.approval,'preflight',f.deps);assert.equal(again.result,'NO_UNFINISHED_OPERATION');assert.equal(again.writes,0);
 }
 const f=await pendingFixture('ambiguous');await assert.rejects(runPrivacyOperator(f.approval,'preflight',f.deps),/OUTCOME_AMBIGUOUS/);
 const g=fixture();await g.journal.enrollEmptyDatabase(g.tx);await g.journal.intent((await g.journal.ready()).head,'LEGACY',{request:{id:'legacy'}});
 g.approval.operation='resolve';g.approval.enrollmentHash=(await g.journal.inspect(false,true)).enrollmentHash;g.approval.originalDatabaseNotRestoredSinceIntent=true;g.approval.outcomeEvidenceReference='review:legacy-original';
 await assert.rejects(runPrivacyOperator(g.approval,'preflight',g.deps),/LEGACY_OUTCOME_EVIDENCE_REQUIRED/);
});
test('resolution rejects a restored target, later DB change, changed journal head and uncertain evidence; lost accepted resolution is read back once',async()=>{
 const f=await pendingFixture('COMMITTED'),p=(await runPrivacyOperator(f.approval,'preflight',f.deps)).plan;
 await assert.rejects(runPrivacyOperator({...f.approval,originalDatabaseNotRestoredSinceIntent:undefined},'resolve',f.deps,p,true),/AUTHORITATIVE_OUTCOME/);
 f.state.digest='later';await assert.rejects(runPrivacyOperator(f.approval,'resolve',f.deps,p,true),/STALE_PLAN/);f.state.digest='before';
 let writes=0;const original=f.store.append.bind(f.store);f.store.append=async(...args)=>{writes++;await original(...args);throw Error('PRIVATE_LOST_ACK');};
 const r=await runPrivacyOperator(f.approval,'resolve',f.deps,p,true);assert.equal(r.outcome,'COMMITTED');assert.equal(writes,1);
 const g=await pendingFixture('NOT_COMMITTED'),q=(await runPrivacyOperator(g.approval,'preflight',g.deps)).plan;
 g.setRequest(g.after);await assert.rejects(runPrivacyOperator(g.approval,'resolve',g.deps,q,true),/STALE_PLAN/);
});
test('reconciliation requires explicit restore approval and preserves pin/key identity; no enrollment on nonempty/conflicting history',async()=>{
 const f=fixture();await f.journal.enrollEmptyDatabase(f.tx);await f.journal.intent((await f.journal.ready()).head,'existing',{request:{id:'existing'}});
 await assert.rejects(runPrivacyOperator(f.approval,'preflight',f.deps),/UNFINISHED_OPERATION/);
 const a={...f.approval,operation:'reconcile',enrollmentHash:'f'.repeat(64)};
 assert.throws(()=>validateOperatorApproval(a,f.deps.databaseUrl,revision,now),/RESTORE_APPROVAL/);
 const g=fixture();await g.journal.enrollEmptyDatabase(g.tx);const state=await g.journal.ready();
 g.approval={...g.approval,operation:'reconcile',enrollmentHash:state.enrollmentHash,restoredFromProduction:true,restorePoint:new Date(now-86400000).toISOString()};
 const r=await runPrivacyOperator(g.approval,'dry-run',g.deps);assert.equal(r.cases,0);assert.equal(r.databaseReconciled,false);assert.equal(r.writes,0);
 await assert.rejects(runPrivacyOperator({...g.approval,enrollmentHash:'f'.repeat(64)},'dry-run',g.deps),/PIN_MISMATCH/);
});
test('S3-backed RESOLVE survives accepted acknowledgement loss and restart without overwriting authenticated legacy history',async()=>{
 const {syntheticS3Journal}=require('./privacyRecoveryS3Fixture.cjs');
 const {S3ProtectedDecisionStore}=require('../dist/services/privacyRecoveryS3');const f=await syntheticS3Journal(key);
 const intent=await f.journal.intent((await f.journal.ready()).head,'SYNTHETIC',{request:{id:'synthetic-resolution'}},{beforeEvidenceDigest:'a'.repeat(64),afterEvidenceDigest:'b'.repeat(64)});
 let lost=false;f.transport.after=async command=>{if(command.constructor.name==='PutObjectCommand'&&JSON.parse(command.input.Body).kind==='RESOLVE'&&!lost){lost=true;throw Error('Synthetic accepted response lost');}};
 await f.journal.resolvePending(intent.head,'COMMITTED','b'.repeat(64),'c'.repeat(64));assert(lost);
 const restarted=new PrivacyRecoveryJournal(new S3ProtectedDecisionStore(f.activeConfig,f.transport),f.journal.scope,key);
 assert.equal((await restarted.ready()).cases.size,1);assert.equal((await restarted.ready()).head.sequence,3);
 assert.equal(f.transport.calls.filter(c=>c.type==='PutObjectCommand'&&JSON.parse(c.input.Body).kind==='RESOLVE').length,1);
});
