const assert = require('node:assert/strict');
const test = require('node:test');
const {randomUUID, randomBytes} = require('node:crypto');
const enabled = process.env.REVIEWER_SAFETY_SYNTHETIC === 'yes';

test('reviewer ordering uses normal credentials and fail-closed synthetic safety on PostgreSQL', {skip: !enabled}, async t => {
  assert.equal(process.env.NODE_ENV, 'test');
  const u = new URL(process.env.DATABASE_URL);
  assert.equal(u.hostname, '127.0.0.1');
  assert.equal(u.pathname, '/reviewer_safety_synthetic');
  assert.ok(['55476', '5432'].includes(u.port));
  const {prisma: db} = require('../dist/lib/prisma');
  const safety = require('../dist/services/syntheticOrderSafety.service');
  const business = require('../dist/controllers/business.controller');
  const geocoding = require('../dist/services/deliveryGeocoding.service');
  const dispatch = require('../dist/services/autoDispatchPickupPlan.service');
  const loyalty = require('../dist/services/loyalty.service');
  const {messaging} = require('../dist/config/firebase');
  const {createOrderController, createSyntheticOrderController, createChatGPTOrderController, updateOrderDetailsController} = require('../dist/controllers/order.controller');
  const {PrivacyDeletionService} = require('../dist/services/privacyDeletion.service');
  const {evaluateOrderStatusTransition} = require('../dist/services/orderStateTransition.service');
  const actor = {userId:'synthetic-owner',role:'ADMIN'};
  const profile = {customerName:'Synthetic Reviewer',customerPhone:'5195550188',customerEmail:'speedysweeties@hotmail.com',addressLine1:'1 Synthetic Street',city:'Guelph',province:'ON'};
  const input = (extra={}) => ({profile,ownerConfirmedSynthetic:true,expiresAt:new Date(Date.now()+86400000).toISOString(),maxOrders:2,maxEmails:2,...extra});
  const body = (extra={}) => ({...profile,orderSource:'IOS_APP',paymentMethod:'CASH',fcmToken:'synthetic-never-send',items:[{name:'Tobacco test item',quantity:1,unitPrice:0},{name:'Cannabis test item',quantity:1,unitPrice:0}],...extra});
  let geocodes=0, dispatches=0, pushes=0;
  const replace=(obj,key,value)=>{const old=obj[key];obj[key]=value;t.after(()=>{obj[key]=old;});};
  replace(business,'isBusinessConfirmedClosed',async()=>false);
  replace(geocoding,'geocodeDeliveryAddress',async()=>{geocodes++;return {geocodeStatus:'VERIFIED',deliveryLatitude:43.5,deliveryLongitude:-80.2};});
  replace(dispatch,'autoDispatchCreatedOrderWithPickupPlan',async()=>{dispatches++;return {dispatched:false,reason:'AUTO_DISPATCH_DISABLED'};});
  replace(loyalty,'sendCustomerLoyaltyNotification',async()=>{pushes++;});
  replace(messaging,'send',async()=>{pushes++;throw new Error('Mock provider must not be called');});
  const call=async (payload=body(), controller=createSyntheticOrderController)=>{
    const res={status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
    await controller({body:payload,headers:{}},res); return res;
  };
  const reset=async()=>{
    // Only this newly created local synthetic database; never use retained/live fixtures.
    await db.privacyAudit.deleteMany();await db.privacyDeletionRequest.deleteMany();await db.privacyAccessCredential.deleteMany();await db.privacyChallenge.deleteMany();
    await db.orderItem.deleteMany();await db.order.deleteMany();await db.itemCatalog.deleteMany();await db.customer.deleteMany();await db.systemSetting.deleteMany();
    geocodes=dispatches=pushes=0;
  };
  const read=async()=>JSON.parse((await db.systemSetting.findUnique({where:{key:safety.SYNTHETIC_ORDER_POLICY_KEY}})).value);
  const write=async p=>db.systemSetting.update({where:{key:safety.SYNTHETIC_ORDER_POLICY_KEY},data:{value:JSON.stringify(p)}});
  try {
    await t.test('only singleton owner ADMIN can enroll; attestation, bounds and contact collisions refuse',async()=>{
      await reset();
      for(const a of [undefined,{...actor,role:'DISPATCHER'},{...actor,userId:'other'}]) await assert.rejects(safety.enrollSyntheticProfile(db,a,input()),e=>e.statusCode===403);
      for(const i of [undefined,input({ownerConfirmedSynthetic:false}),input({profile:{...profile,customerEmail:'wrong@example.invalid'}}),input({maxOrders:7}),input({maxEmails:4}),input({expiresAt:new Date(Date.now()+8*86400000).toISOString()})]) await assert.rejects(safety.enrollSyntheticProfile(db,actor,i));
      await db.customer.create({data:{fullName:'Other synthetic',normalizedFullName:'other',phone:profile.customerPhone,normalizedPhone:profile.customerPhone,addressLine1:'Other',city:'Guelph',province:'ON'}});
      await assert.rejects(safety.enrollSyntheticProfile(db,actor,input()));
      assert.equal(await db.systemSetting.count(),0);
    });
    await t.test('missing enrollment and every near-match refuse before geocoding or order writes',async()=>{
      await reset();await assert.rejects(call());assert.equal(geocodes,0);
      await safety.enrollSyntheticProfile(db,actor,input());
      for(const patch of [{customerName:'Other'},{customerPhone:'5195550189'},{customerEmail:'other@example.invalid'},{addressLine1:'Other'},{unitNumber:'3'},{city:'Toronto'},{province:'QC'},{customerPhone:'5195550189',customerEmail:'other@example.invalid'}]) await assert.rejects(call(body(patch)));
      assert.equal(geocodes,0);assert.equal(await db.customer.count(),0);assert.equal(await db.order.count(),0);
    });
    await t.test('normal pipeline returns real credentials; cancellation commits before observation; no catalogue/dispatch/push',async()=>{
      await reset();await safety.enrollSyntheticProfile(db,actor,input());
      const r=await call();assert.equal(r.code,201);assert.equal(r.body.order.orderStatus,'CANCELLED');
      assert.ok(r.body.trackingToken?.length>20);assert.ok(r.body.loyaltyAccessToken?.length>20);
      const o=await db.order.findUnique({where:{id:r.body.order.id},include:{items:true,customer:true}});
      assert.equal(o.assignedDriverId,null);assert.equal(o.fcmToken,null);assert.equal(o.customer.smsMarketingOptOut,true);
      assert.equal(o.items.length,2);assert.ok(o.items.every(i=>i.itemCatalogId===null));
      assert.equal(await db.itemCatalog.count(),0);assert.equal(await db.digitalReceipt.count(),0);assert.equal(await db.dispatchEvent.count(),0);
      assert.equal(dispatches,0);assert.equal(pushes,0);assert.equal((await read()).ordersCreated,1);
      for(const actor of ['AUTO_DISPATCH','MANUAL_ASSIGNMENT','MANUAL_UNASSIGNMENT','DRIVER_ACTION','RECEIPT','STAFF_CANCELLATION']) assert.equal(evaluateOrderStatusTransition({actor,currentStatus:'CANCELLED',targetStatus:'DISPATCHED',hasPersistedReceipt:true}).allowed,false);
      const recovery=await require('./privacyRecoveryFixture.cjs').syntheticJournal(process.env.PRIVACY_DIGEST_KEY);
      let mailCalls=0;const sent=new Map();
      const svc=new PrivacyDeletionService(db,process.env.PRIVACY_DIGEST_KEY,{async start(m){mailCalls++;assert.equal(m.channel,'EMAIL');assert.equal(m.to,profile.customerEmail);sent.set(m.id,m.code);return {};},async check(){return false;}},()=>false,'within 30 days','12-31',recovery);
      const ch=await svc.challenge({trackingToken:r.body.trackingToken},'synthetic-ip');
      const accessToken=randomBytes(32).toString('hex');const {proof}=await svc.verify(ch.challengeId,sent.get(ch.challengeId),accessToken);
      const request={id:randomUUID(),token:randomBytes(32).toString('hex'),challengeId:ch.challengeId,proof,accessToken};
      await svc.submit(request);assert.equal((await svc.status(request.id,request.token)).status,'SUBMITTED');
      await assert.rejects(svc.fulfill(request.id,actor.userId,1,'not-a-preview',{policyReference:'SYNTHETIC ONLY',justification:'Synthetic test only, no real financial records',taxYearEnd:new Date().getUTCFullYear()+'-12-31',financialRetainUntil:new Date(Date.now()+7*365*86400000).toISOString(),personalFields:[],financialFields:[...require('../dist/services/privacyDeletion.service').retainedFinancialFields],unlinkedRecordsReviewed:true,confirmed:true}),/FULFILLMENT_DISABLED/);
      await svc.cancel(request.id,request.token);assert.equal((await svc.status(request.id,request.token)).status,'CANCELLED');
      const after=await db.order.findUnique({where:{id:o.id},include:{items:true,customer:true}});assert.deepEqual(after,o);
      assert.equal(mailCalls,1);assert.equal((await read()).emailsClaimed,1);assert.equal(dispatches,0);assert.equal(pushes,0);
    });
    await t.test('normal route also protects enrolled profile; unrelated customers retain ordinary ordering',async()=>{
      await reset();await safety.enrollSyntheticProfile(db,actor,input());
      assert.equal((await call(body(),createOrderController)).body.order.orderStatus,'CANCELLED');
      const other=await call(body({customerName:'Other synthetic',customerPhone:'5195550199',customerEmail:'other@example.invalid'}),createOrderController);
      assert.equal(other.body.order.orderStatus,'PLACED');assert.equal(dispatches,1);assert.equal(pushes,1);
    });
    await t.test('concurrent order attempts cannot exceed cap or create two customers',async()=>{
      await reset();await safety.enrollSyntheticProfile(db,actor,input({maxOrders:1}));
      const results=await Promise.allSettled([call(),call()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(await db.customer.count(),1);assert.equal(await db.order.count(),1);assert.equal((await read()).ordersCreated,1);
    });
    await t.test('changed fixture, conflicting customer, callback, and partial failure roll back safely',async()=>{
      await reset();await safety.enrollSyntheticProfile(db,actor,input());
      await assert.rejects(call(body(),(req,res)=>createChatGPTOrderController(req,res,async()=>assert.fail('callback'))));assert.equal(await db.order.count(),0);
      await db.$executeRawUnsafe('ALTER TABLE "OrderItem" ADD CONSTRAINT reviewer_safety_injected CHECK (false) NOT VALID');
      try{await assert.rejects(call());}finally{await db.$executeRawUnsafe('ALTER TABLE "OrderItem" DROP CONSTRAINT reviewer_safety_injected');}
      assert.equal(await db.customer.count(),0);assert.equal(await db.order.count(),0);assert.equal((await read()).ordersCreated,0);
      const r=await call();await db.customer.update({where:{id:r.body.order.customerId},data:{fullName:'Changed synthetic identity'}});await assert.rejects(call());
      await db.customer.update({where:{id:r.body.order.customerId},data:{fullName:profile.customerName}});
      await db.order.update({where:{id:r.body.order.id},data:{cancellationReason:'Changed fixture'}});await assert.rejects(call());
      await db.order.update({where:{id:r.body.order.id},data:{cancellationReason:safety.SYNTHETIC_CANCELLATION_REASON}});
      await db.customer.create({data:{fullName:'Conflict',normalizedFullName:'conflict',phone:'5195550110',normalizedPhone:'5195550110',email:profile.customerEmail,normalizedEmail:profile.customerEmail,addressLine1:'Other',city:'Guelph',province:'ON'}});
      await assert.rejects(call());assert.equal(await db.order.count(),1);
    });
    await t.test('closed, expired, wrong-key and malformed registry cannot become operational orders',async()=>{
      for(const kind of ['closed','expired','key','malformed']){
        await reset();await safety.enrollSyntheticProfile(db,actor,input());const p=await read();
        if(kind==='closed')await safety.closeSyntheticProfile(db,actor);
        if(kind==='expired')await write({...p,expiresAt:new Date(0).toISOString()});
        if(kind==='key')await write({...p,keyFingerprint:'0'.repeat(64)});
        if(kind==='malformed')await db.systemSetting.update({where:{key:safety.SYNTHETIC_ORDER_POLICY_KEY},data:{value:'invalid'}});
        await assert.rejects(call(body(),createOrderController));await assert.rejects(call());assert.equal(await db.order.count(),0);
      }
    });
    await t.test('email claims serialize; failures consume allowance; SMS and expiry refuse',async()=>{
      await reset();await safety.enrollSyntheticProfile(db,actor,input({maxEmails:1}));const r=await call();const customerId=r.body.order.customerId;
      const claim=channel=>db.$transaction(tx=>safety.claimSyntheticEmail(tx,customerId,channel,profile.customerEmail));
      const results=await Promise.allSettled([claim('EMAIL'),claim('EMAIL')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await read()).emailsClaimed,1);
      await assert.rejects(claim('PHONE'));await assert.rejects(claim('EMAIL'));
      await write({...await read(),emailsClaimed:0,expiresAt:new Date(0).toISOString()});await assert.rejects(claim('EMAIL'));
    });
    await t.test('receipt, intake and ordinary-order edit cannot escape protected scope',async()=>{
      await reset();await safety.enrollSyntheticProfile(db,actor,input());const r=await call();
      const {createOrUpdateReceiptController}=require('../dist/controllers/receipt.controller');
      const response={status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
      for(const role of ['ADMIN','DISPATCHER','DRIVER']) await assert.rejects(createOrUpdateReceiptController({params:{id:r.body.order.id},user:{userId:actor.userId,role},body:{itemTotal:1,deliveryCharge:0,taxOrFees:0,grandTotal:1}},response));
      await assert.rejects(db.$transaction(tx=>safety.assertNotSyntheticIntake(tx,r.body.order.customerId)));
      await assert.rejects(db.$transaction(tx=>safety.claimSyntheticEmail(tx,r.body.order.customerId,'EMAIL','other@example.invalid')));
      assert.equal((await read()).emailsClaimed,0);assert.equal(await db.digitalReceipt.count(),0);assert.equal(pushes,0);
      const ordinary=await call(body({customerName:'Other synthetic',customerPhone:'5195550199',customerEmail:'other@example.invalid'}),createOrderController);
      const before=await db.order.findUnique({where:{id:ordinary.body.order.id}});
      await assert.rejects(updateOrderDetailsController({params:{id:before.id},body:body(),user:actor},response));
      assert.deepEqual(await db.order.findUnique({where:{id:before.id}}),before);
    });
    await t.test('direct normal-route calls and client-supplied flags cannot change server caps',async()=>{
      await reset();await safety.enrollSyntheticProfile(db,actor,input({maxOrders:1,maxEmails:1}));
      await call(body({syntheticRequired:false,syntheticOrder:false,orderStatus:'DELIVERED',maxOrders:999}),createOrderController);
      await assert.rejects(call(body({maxOrders:999}),createOrderController));
      const p=await read();assert.equal(p.ordersCreated,1);assert.equal(p.maxOrders,1);
      const row=await db.order.findFirst();assert.equal(row.orderStatus,'CANCELLED');assert.equal(dispatches,0);assert.equal(pushes,0);
      for(const patch of [{customerPhone:'5195550117'},{customerEmail:'other@example.invalid'}]) await assert.rejects(call(body(patch),createOrderController));
    });
    await t.test('provider failure is not retried and consumes its committed claim',async()=>{
      await reset();await safety.enrollSyntheticProfile(db,actor,input({maxEmails:1}));const r=await call();
      const recovery=await require('./privacyRecoveryFixture.cjs').syntheticJournal(process.env.PRIVACY_DIGEST_KEY);let sends=0;
      const svc=new PrivacyDeletionService(db,process.env.PRIVACY_DIGEST_KEY,{async start(){sends++;throw new Error('mock outage');},async check(){return false;}},()=>false,'within 30 days','12-31',recovery);
      await assert.rejects(svc.challenge({trackingToken:r.body.trackingToken},'synthetic-ip'));assert.equal(sends,1);assert.equal((await read()).emailsClaimed,1);
      await assert.rejects(svc.challenge({trackingToken:r.body.trackingToken},'synthetic-ip'));assert.equal(sends,1);
    });
  } finally { await reset();await db.$disconnect(); }
});
