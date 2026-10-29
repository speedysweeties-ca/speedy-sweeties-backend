const {test}=require('node:test');const assert=require('node:assert/strict');const {randomBytes,randomUUID}=require('node:crypto');
test('offline operator dry-run/apply and outcome resolution use real serial synthetic PostgreSQL, never production',{
 skip:process.env.PRIVACY_SYNTHETIC_DATABASE!=='yes'
},async t=>{
 assert.equal(process.env.NODE_ENV,'test');const actual=new URL(process.env.DATABASE_URL);
 assert.equal(actual.hostname,'127.0.0.1');assert.equal(actual.pathname,'/speedy_privacy_synthetic');assert.equal(actual.username,'privacy_test');
 const {prisma:db}=require('../dist/lib/prisma');const {PrivacyRecoveryJournal}=require('../dist/services/privacyRecoveryJournal');
 const {SyntheticDecisionStore}=require('./privacyRecoveryFixture.cjs');
 const {PrivacyDeletionService,retainedFinancialFields,externalSystems}=require('../dist/services/privacyDeletion.service');
 const {runPrivacyOperator,privacyBaseline}=require('../dist/services/privacyRecoveryOperator');
 const {dump,restore}=require('./privacyRecoverySnapshot.cjs');
 const key='synthetic-operator-db-stable-key-not-jwt-at-least-32',scope='speedy-privacy-production-epoch-0001',store=new SyntheticDecisionStore();
 const journal=new PrivacyRecoveryJournal(store,scope,key);
 // The original suite leaves its own initial synthetic fixture. Establish every
 // preexisting row as synthetic before allowing the shared dump/restore helper.
 const customers=await db.customer.findMany(),orders=await db.order.findMany();
 assert(customers.every(c=>c.fullName==='Synthetic Recovery'&&/^5195550\d{3}$/.test(c.normalizedPhone)));
 assert(orders.every(o=>o.customerName==='Synthetic Recovery'&&/^5195550\d{3}$/.test(o.phone)));
 assert((await privacyBaseline(db)).every(r=>r.count===0));await journal.enrollEmptyDatabase(db);
 const sent=new Map(),delivery={async start(m){sent.set(m.id,m.code);return{};},async check(){assert.fail('No provider call');}};
 let service=new PrivacyDeletionService(db,key,delivery,()=>true,'Synthetic normal 30-day timeframe','12-31',journal);
 const fixtures={customers:new Set(customers.map(c=>c.id)),orders:new Set(orders.map(o=>o.id)),phoneHashes:new Set(customers.map(c=>service.hash(`phone:${c.normalizedPhone}`)))};
 const seed=async n=>{
  const phone=`51955502${String(n).padStart(2,'0')}`;
  const c=await db.customer.create({data:{fullName:'Synthetic Recovery',normalizedFullName:'synthetic recovery',phone,normalizedPhone:phone,email:`operator-${n}@example.invalid`,normalizedEmail:`operator-${n}@example.invalid`,addressLine1:'Synthetic only',city:'Guelph',province:'ON'}});
  const tracking=randomBytes(32).toString('hex');
  const o=await db.order.create({data:{customerId:c.id,customerName:c.fullName,phone,email:c.email,addressLine1:c.addressLine1,city:c.city,province:c.province,paymentMethod:'CASH',orderStatus:'DELIVERED',orderSource:'IOS_APP',itemsText:'Synthetic private text',
   trackingTokenHash:require('../dist/services/privacyDeletion.service').digest(tracking),trackingTokenExpiresAt:new Date(Date.now()+86400000),
   items:{create:{name:'Synthetic financial item description',quantity:2,price:'4.25'}},digitalReceipt:{create:{receiptNumber:randomUUID(),itemTotal:'8.50',deliveryCharge:'12',taxOrFees:'0',grandTotal:'20.50',notes:'Extra stops: 2\nExtra stop charge: $8.00\nDistance surcharge: $4.00\nSynthetic private receipt note'}}}});
  fixtures.customers.add(c.id);fixtures.orders.add(o.id);fixtures.phoneHashes.add(service.hash(`phone:${phone}`));return{c,o,tracking};
 };
 const submit=async f=>{const challenge=await service.challenge({trackingToken:f.tracking},'synthetic-operator');const accessToken=randomBytes(32).toString('hex');
  const {proof}=await service.verify(challenge.challengeId,sent.get(challenge.challengeId),accessToken);
  const input={id:randomUUID(),token:randomBytes(32).toString('hex'),challengeId:challenge.challengeId,proof,accessToken};await service.submit(input);return input;};
 const approval=()=>{const at=Date.now(),e={reference:'synthetic:existing-mfa-evidence',verifiedAt:new Date(at-1000).toISOString(),expiresAt:new Date(at+600000).toISOString()};return{
  format:1,operation:'reconcile',workspaceId:'tea-d7loaul7vvec73cme5d0',serviceId:'srv-d7ntlnpkh4rs73bev9q0',resourceId:'dpg-aaaaaaaaaaaaaaaaaaaa-a',hostname:'dpg-aaaaaaaaaaaaaaaaaaaa-a.ohio-postgres.render.com',databaseName:'speedy_privacy_synthetic',databaseUser:'privacy_test',sourceRevision:'a'.repeat(40),
  ownerAccountId:'080413009273',bucket:'speedy-sweeties-privacy-decisions-080413009273',region:'ca-central-1',prefix:'production/epoch-0001/',scope,enrollmentHash:store.entries[0].hash,
  operatorArn:'arn:aws:sts::080413009273:assumed-role/SyntheticOperator/session',awsProfile:'synthetic-only',mfa:e,exclusion:{...e,allWritersStopped:true},
  pinRecordReference:'synthetic:protected-record',approvedAt:e.verifiedAt,expiresAt:e.expiresAt,restoredFromProduction:true,restorePoint:new Date(at-86400000).toISOString()};};
 const deps=a=>({db,journal,service,digestKey:key,sourceRevision:a.sourceRevision,
  // Cloud identity is controlled. The actual DB connection above is guarded
  // loopback-only; no production/Render/AWS socket exists in this test.
  databaseUrl:`postgresql://privacy_test:synthetic-only@${a.hostname}/speedy_privacy_synthetic?sslmode=require`,
  verifyTarget:async()=>({...a,status:'available'}),identity:async()=>({Account:a.ownerAccountId,Arn:a.operatorArn}),versions:async()=>[]});
 const readOrder=id=>db.order.findUnique({where:{id},include:{items:true,digitalReceipt:true}});
 let snapshot;
 try{
  const a=await seed(1),b=await seed(2),c=await seed(3),unrelated=await seed(4);const unrelatedBefore=await readOrder(unrelated.o.id);
  snapshot=await dump(db,fixtures);
  const ia=await submit(a),ib=await submit(b),ic=await submit(c);const p=await service.impact(ia.id),year=new Date().getUTCFullYear();
  await service.fulfill(ia.id,'synthetic-admin',p.version,p.previewHash,{policyReference:'SYNTHETIC-RETENTION',justification:'Synthetic readable financial evidence retained.',taxYearEnd:`${year}-12-31`,financialRetainUntil:`${year+6}-12-31T23:59:59.999Z`,personalFields:[],financialFields:[...retainedFinancialFields],unlinkedRecordsReviewed:true,confirmed:true});
  for(const system of externalSystems)await service.resolveExternal(ia.id,'synthetic-admin',system,'Synthetic external review evidence.');
  await service.complete(ia.id,'synthetic-admin');await service.cancel(ib.id,ib.token);await service.hold(ic.id,'synthetic-admin');
  const original=await db.privacyDeletionRequest.findUnique({where:{id:ia.id}}),marker=await db.privacyDeletedIdentity.findFirst();
  await restore(db,fixtures,snapshot);
  await t.test('readonly plan changes no row; stale DB and changed journal heads reject before erasure',async()=>{
   const auth=approval(),d=deps(auth),before=await db.customer.findUnique({where:{id:a.c.id}}),r=await runPrivacyOperator(auth,'dry-run',d);
   assert.equal(r.databaseReconciled,false);assert.equal(r.erased,1);assert.equal(r.writes,0);
   assert.deepEqual(await db.customer.findUnique({where:{id:a.c.id}}),before);assert.equal(await db.privacyDeletionRequest.count(),0);
   await db.customer.update({where:{id:unrelated.c.id},data:{notes:'Synthetic concurrent change'}});
   await assert.rejects(runPrivacyOperator(auth,'apply',d,r.plan,true),/STALE_PLAN/);assert(await db.customer.findUnique({where:{id:a.c.id}}));
   await db.customer.update({where:{id:unrelated.c.id},data:{notes:null}});
   const next=await runPrivacyOperator(auth,'dry-run',d),savedHead={...store.head};
   const last=store.entries.at(-1);await journal.intent(savedHead,'synthetic-unfinished',{state:last.payload});
   await assert.rejects(runPrivacyOperator(auth,'apply',d,next.plan,true),/UNFINISHED_OPERATION/);
   // Remove only the deliberate test-double injection; no S3/history edit occurs.
   store.entries.pop();store.head=savedHead;
  });
  await t.test('authorized apply reuses scoped erasure; financial evidence, dates, cancellation, hold and unrelated orders survive',async()=>{
   const protectedItem=(await readOrder(a.o.id)).items[0];
   await db.orderItem.update({where:{id:protectedItem.id},data:{price:'99'}});
   await assert.rejects(runPrivacyOperator(approval(),'dry-run',deps(approval())),/FINANCIAL_EVIDENCE_CHANGED/);
   await db.orderItem.update({where:{id:protectedItem.id},data:{price:'4.25'}});
   await db.privacyDeletionRequest.create({data:{...original,status:'HOLD',version:original.version+1,databaseErasedAt:null}});
   await assert.rejects(runPrivacyOperator(approval(),'dry-run',deps(approval())),/NEWER_DATABASE_DECISION/);
   await db.privacyDeletionRequest.delete({where:{id:original.id}});
   const auth=approval(),d=deps(auth),p=await runPrivacyOperator(auth,'dry-run',d);const r=await runPrivacyOperator(auth,'apply',d,p.plan,true);
   assert.equal(r.databaseReconciled,true);assert.equal(r.erased,1);assert.equal(r.trafficMayReopen,false);
   assert.equal(await db.customer.findUnique({where:{id:a.c.id}}),null);
   const kept=await readOrder(a.o.id);assert.equal(kept.items[0].name,'Synthetic financial item description');assert.equal(kept.items[0].quantity,2);assert.equal(kept.items[0].price.toString(),'4.25');
   assert.equal(kept.digitalReceipt.grandTotal.toString(),'20.5');assert.deepEqual(kept.digitalReceipt.retainedChargeEvidence,{extraStops:2,extraStopCharge:'8.00',distanceSurcharge:'4.00'});
   assert.equal(kept.phone,'');assert.equal(kept.trackingTokenHash,null);assert.equal(await db.privacyAccessCredential.count({where:{customerId:a.c.id}}),0);
   const final=await db.privacyDeletionRequest.findUnique({where:{id:ia.id}});
   for(const k of ['createdAt','dueAt','databaseErasedAt','completedAt','closedAt','requestAuditReviewAt'])assert.equal(final[k].toISOString(),original[k].toISOString());
   const afterMarker=await db.privacyDeletedIdentity.findFirst();assert.equal(afterMarker.reviewAt.toISOString(),marker.reviewAt.toISOString());
   assert.equal((await service.status(ib.id,ib.token)).status,'CANCELLED');assert.equal((await service.status(ic.id,ic.token)).status,'HOLD');
   assert.deepEqual(await readOrder(unrelated.o.id),unrelatedBefore);
   await assert.rejects(db.orderItem.delete({where:{id:kept.items[0].id}}));await assert.rejects(db.digitalReceipt.delete({where:{orderId:a.o.id}}));
   const inspect=await runPrivacyOperator(auth,'dry-run',d);assert.equal(inspect.erased,0);assert.equal(inspect.writes,0);
  });
  await t.test('real DB rollback before commit resolves NOT_COMMITTED; failed post-commit acknowledgement resolves COMMITTED without redoing deletion',async()=>{
   const faultyDb={$transaction:work=>db.$transaction(async tx=>{await work(tx);throw Error('Synthetic transaction rollback before commit');})};
   const faulty=new PrivacyDeletionService(faultyDb,key,delivery,()=>false,'Synthetic normal 30-day timeframe','12-31',journal);
   await assert.rejects(faulty.cancel(ic.id,ic.token),/RECOVERY_UNAVAILABLE/);assert.equal((await db.privacyDeletionRequest.findUnique({where:{id:ic.id}})).status,'HOLD');
   const auth={...approval(),operation:'resolve',resourceId:'dpg-d7m33g2qqhas73f58hrg-a',hostname:'dpg-d7m33g2qqhas73f58hrg-a.ohio-postgres.render.com',originalDatabaseNotRestoredSinceIntent:true,outcomeEvidenceReference:'synthetic:original-database-transaction-evidence'};
   let plan=await runPrivacyOperator(auth,'preflight',deps(auth));assert.equal(plan.plan.outcome,'NOT_COMMITTED');
   await runPrivacyOperator(auth,'resolve',deps(auth),plan.plan,true);assert.equal((await service.status(ic.id,ic.token)).status,'HOLD');
   store.failKind='COMMIT';await assert.rejects(service.cancel(ic.id,ic.token),/RECOVERY_UNAVAILABLE/);store.failKind=null;
   assert.equal((await db.privacyDeletionRequest.findUnique({where:{id:ic.id}})).status,'CANCELLED');
   plan=await runPrivacyOperator(auth,'preflight',deps(auth));assert.equal(plan.plan.outcome,'COMMITTED');
   await runPrivacyOperator(auth,'resolve',deps(auth),plan.plan,true);assert.equal((await service.status(ic.id,ic.token)).status,'CANCELLED');
   assert.deepEqual(await readOrder(unrelated.o.id),unrelatedBefore);assert.equal(await db.customer.findUnique({where:{id:a.c.id}}),null);
  });
 }finally{if(snapshot)await restore(db,fixtures,snapshot);await db.$disconnect();}
});
