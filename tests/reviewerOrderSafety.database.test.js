const assert = require('node:assert/strict');
const test = require('node:test');
const {randomUUID, randomBytes} = require('node:crypto');
const enabled = process.env.REVIEWER_SAFETY_SYNTHETIC === 'yes';

test('reviewer ordering uses normal credentials and fail-closed synthetic safety on PostgreSQL', {skip: !enabled}, async t => {
  assert.equal(process.env.NODE_ENV, 'test');
  const previousApprovedEmail=process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL;
  process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL='synthetic-reviewer@example.invalid';
  t.after(()=>{if(previousApprovedEmail===undefined)delete process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL;else process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL=previousApprovedEmail;});
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
  const profile = {customerName:'Synthetic Reviewer',customerPhone:'5195550188',customerEmail:'synthetic-reviewer@example.invalid',addressLine1:'1 Synthetic Street',city:'Guelph',province:'ON'};
  const correctedProfile = {...profile,addressLine1:'2 Corrected Street',unitNumber:'2',buzzCode:'42'};
  const invalidAddressLine = '999 Invalid Address';
  const input = (extra={}) => ({profile,ownerConfirmedSynthetic:true,expiresAt:new Date(Date.now()+86400000).toISOString(),maxOrders:2,maxEmails:2,...extra});
  const body = (extra={}) => ({...profile,orderSource:'IOS_APP',paymentMethod:'CASH',fcmToken:'synthetic-never-send',items:[{name:'Tobacco test item',quantity:1,unitPrice:0},{name:'Cannabis test item',quantity:1,unitPrice:0}],...extra});
  let geocodes=0, dispatches=0, pushes=0;
  const replace=(obj,key,value)=>{const old=obj[key];obj[key]=value;t.after(()=>{obj[key]=old;});};
  replace(business,'isBusinessConfirmedClosed',async()=>false);
  replace(geocoding,'geocodeDeliveryAddress',async address=>{
    geocodes++;
    if(address.addressLine1===invalidAddressLine)throw new geocoding.DeliveryAddressValidationError('Invalid test address');
    return {geocodeStatus:'VERIFIED',deliveryLatitude:43.5,deliveryLongitude:-80.2};
  });
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
  const conflict=code=>error=>error?.statusCode===409&&error?.details?.code===code;
  const correction=(currentProfile=profile,nextProfile=correctedProfile,correctionActor=actor,now)=>safety.correctUnusedSyntheticProfileAddress(db,correctionActor,{ownerConfirmedSynthetic:true,currentProfile,correctedProfile:nextProfile},now);
  try {
    await t.test('ADMIN diagnostics distinguish preconditions, collisions and existing policy without weakening rechecks',async()=>{
      await reset();
      for(const a of [undefined,{...actor,role:'DISPATCHER'},{...actor,userId:'other'}]) await assert.rejects(safety.enrollSyntheticProfile(db,a,input()),e=>e.statusCode===403);
      for(const configured of [undefined,'not-an-email']) {
        if(configured===undefined)delete process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL;else process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL=configured;
        await assert.rejects(safety.validateSyntheticEnrollmentProfile(db,actor,input()),conflict('ENROLLMENT_PRECONDITION'));
      }
      process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL=profile.customerEmail;
      for(const i of [undefined,input({ownerConfirmedSynthetic:false}),input({profile:{...profile,customerEmail:'wrong@example.invalid'}}),input({maxOrders:7}),input({maxEmails:4}),input({expiresAt:new Date(Date.now()-1000).toISOString()}),input({expiresAt:new Date(Date.now()+8*86400000).toISOString()})]) {
        await assert.rejects(safety.enrollSyntheticProfile(db,actor,i),conflict('ENROLLMENT_PRECONDITION'));
      }
      assert.deepEqual(await safety.validateSyntheticEnrollmentProfile(db,actor,input()),{eligible:true});
      assert.equal(await db.systemSetting.count(),0);
      await db.customer.create({data:{fullName:'Other synthetic',normalizedFullName:'other',phone:profile.customerPhone,normalizedPhone:profile.customerPhone,addressLine1:'Other',city:'Guelph',province:'ON'}});
      await assert.rejects(safety.enrollSyntheticProfile(db,actor,input()),conflict('PROFILE_COLLISION'));
      assert.equal(await db.systemSetting.count(),0);
      await db.customer.deleteMany();
      await safety.enrollSyntheticProfile(db,actor,input());
      await assert.rejects(safety.validateSyntheticEnrollmentProfile(db,actor,input()),conflict('EXISTING_POLICY'));
      await assert.rejects(safety.enrollSyntheticProfile(db,actor,input()),conflict('EXISTING_POLICY'));
    });
    await t.test('enrollment and ordinary ordering share the native invalid-address refusal',async()=>{
      await reset();const invalidProfile={...profile,addressLine1:invalidAddressLine};
      for(const action of [
        ()=>safety.validateSyntheticEnrollmentProfile(db,actor,input({profile:invalidProfile})),
        ()=>safety.enrollSyntheticProfile(db,actor,input({profile:invalidProfile}))
      ]) await assert.rejects(action(),conflict('INVALID_DELIVERY_ADDRESS'));
      assert.equal(await db.systemSetting.count(),0);
      const ordinary=await call(body({customerName:'Ordinary Customer',customerPhone:'5195550199',customerEmail:'ordinary@example.invalid',addressLine1:invalidAddressLine}),createOrderController);
      assert.equal(ordinary.code,400);assert.equal(ordinary.body.code,'INVALID_DELIVERY_ADDRESS');
      assert.equal(await db.customer.count(),0);assert.equal(await db.order.count(),0);
      const tooLong={...profile,addressLine1:'1'.repeat(201)};
      await assert.rejects(safety.validateSyntheticEnrollmentProfile(db,actor,input({profile:tooLong})),conflict('INVALID_DELIVERY_ADDRESS'));
    });
    await t.test('missing enrollment and every near-match refuse before geocoding or order writes',async()=>{
      await reset();await assert.rejects(call());assert.equal(geocodes,0);
      await safety.enrollSyntheticProfile(db,actor,input());
      const enrollmentGeocodes=geocodes;
      for(const patch of [{customerName:'Other'},{customerPhone:'5195550189'},{customerEmail:'other@example.invalid'},{addressLine1:'Other'},{unitNumber:'3'},{city:'Toronto'},{province:'QC'},{customerPhone:'5195550189',customerEmail:'other@example.invalid'}]) await assert.rejects(call(body(patch)));
      assert.equal(geocodes,enrollmentGeocodes);assert.equal(await db.customer.count(),0);assert.equal(await db.order.count(),0);
    });
    await t.test('unused policy address correction is in-place, private and preserves identity, expiry and allowances',async()=>{
      await reset();await safety.enrollSyntheticProfile(db,actor,input());const before=await read();
      const result=await correction();const after=await read();
      assert.deepEqual(result,{state:'ACTIVE',expiresAt:before.expiresAt,ordersCreated:0,emailsClaimed:0,maxOrders:2,maxEmails:2,addressCorrected:true});
      for(const key of ['version','state','expiresAt','maxOrders','ordersCreated','maxEmails','emailsClaimed','phoneHash','emailHash','keyFingerprint','customerId']) assert.deepEqual(after[key],before[key],key);
      assert.notEqual(after.profileHash,before.profileHash);
      assert.deepEqual(after.addressCorrectionAudit,{event:'UNUSED_ADDRESS_CORRECTED',actorId:actor.userId,correctedAt:after.addressCorrectionAudit.correctedAt});
      assert.ok(Number.isFinite(Date.parse(after.addressCorrectionAudit.correctedAt)));
      const stored=JSON.stringify(after);
      for(const privateValue of [profile.customerName,profile.customerPhone,profile.customerEmail,profile.addressLine1,correctedProfile.addressLine1,correctedProfile.unitNumber,correctedProfile.buzzCode]) assert.equal(stored.includes(privateValue),false);
      await assert.rejects(correction(),conflict('UNUSED_POLICY_CORRECTION_REFUSED'));
      await assert.rejects(call(body()));
      const order=await call(body(correctedProfile));assert.equal(order.code,201);assert.equal(order.body.order.orderStatus,'CANCELLED');
      assert.equal((await read()).ordersCreated,1);
    });
    await t.test('unused policy correction fails closed for authorization, identity, expiry and any consumed or linked state',async()=>{
      await reset();
      for(const correctionActor of [undefined,{...actor,role:'DISPATCHER'},{...actor,userId:'other'}]) await assert.rejects(
        safety.correctUnusedSyntheticProfileAddress(db,correctionActor,{ownerConfirmedSynthetic:true,currentProfile:profile,correctedProfile}),
        error=>error?.statusCode===403
      );
      await assert.rejects(correction(),conflict('UNUSED_POLICY_CORRECTION_REFUSED'));
      await safety.enrollSyntheticProfile(db,actor,input());
      const unchanged=await read();
      await assert.rejects(correction(profile,{...correctedProfile,addressLine1:invalidAddressLine}),conflict('INVALID_DELIVERY_ADDRESS'));
      await assert.rejects(correction(profile,{...correctedProfile,addressLine1:'1'.repeat(201)}),conflict('INVALID_DELIVERY_ADDRESS'));
      assert.deepEqual(await read(),unchanged);
      for(const changed of [
        {...correctedProfile,customerName:'Changed Reviewer'},
        {...correctedProfile,customerPhone:'5195550189'},
        {...correctedProfile,customerEmail:'other@example.invalid'},
        {...correctedProfile,city:'Toronto'},
        {...correctedProfile,province:'QC'},
        {...profile}
      ]) await assert.rejects(correction(profile,changed),conflict('UNUSED_POLICY_CORRECTION_REFUSED'));
      const original=await read();
      for(const [patch,code] of [
        [{state:'CLOSED'},'UNUSED_POLICY_CORRECTION_REFUSED'],
        [{expiresAt:new Date(0).toISOString()},'EXPIRY_ELAPSED'],
        [{ordersCreated:1},'UNUSED_POLICY_CORRECTION_REFUSED'],
        [{emailsClaimed:1},'UNUSED_POLICY_CORRECTION_REFUSED'],
        [{customerId:randomUUID()},'UNUSED_POLICY_CORRECTION_REFUSED'],
        [{addressCorrectionAudit:{event:'UNUSED_ADDRESS_CORRECTED',actorId:actor.userId,correctedAt:new Date().toISOString()}},'UNUSED_POLICY_CORRECTION_REFUSED']
      ]) {
        await write({...original,...patch});await assert.rejects(correction(),conflict(code));
      }
      await write(original);
      await db.customer.create({data:{fullName:'Concurrent collision',normalizedFullName:'concurrent collision',phone:profile.customerPhone,normalizedPhone:profile.customerPhone,email:profile.customerEmail,normalizedEmail:profile.customerEmail,addressLine1:'Other',city:'Guelph',province:'ON'}});
      await assert.rejects(correction(),conflict('UNUSED_POLICY_CORRECTION_REFUSED'));
      await db.customer.deleteMany();
      const protectedOrder=await call();assert.equal(protectedOrder.code,201);
      const afterOrder=await read();await write({...afterOrder,ordersCreated:0,customerId:null});
      await assert.rejects(correction(),conflict('UNUSED_POLICY_CORRECTION_REFUSED'));
    });
    await t.test('concurrent unused-policy correction and order serialize so only one can claim the original profile',async()=>{
      await reset();await safety.enrollSyntheticProfile(db,actor,input());
      const results=await Promise.allSettled([correction(),call()]);
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
      const p=await read(),orders=await db.order.count();
      assert.equal((p.addressCorrectionAudit?1:0)+orders,1);
      if(p.addressCorrectionAudit){assert.equal(p.ordersCreated,0);assert.equal(p.customerId,null);}
      else {assert.equal(p.ordersCreated,1);assert.notEqual(p.customerId,null);}
    });
    await t.test('two concurrent unused-policy corrections cannot both commit',async()=>{
      await reset();await safety.enrollSyntheticProfile(db,actor,input());
      const results=await Promise.allSettled([correction(),correction()]);
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
      assert.equal(results.filter(result=>result.status==='rejected'&&conflict('UNUSED_POLICY_CORRECTION_REFUSED')(result.reason)).length,1);
      const p=await read();assert.equal(p.ordersCreated,0);assert.equal(p.emailsClaimed,0);assert.equal(p.customerId,null);assert.equal(p.addressCorrectionAudit.event,'UNUSED_ADDRESS_CORRECTED');
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
    // Observe real PostgreSQL advisory-lock waiting without logging query text/rows.
    const waiting = async () => {
      const [r] = await db.$queryRaw`SELECT EXISTS (
        SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE a.datname = current_database() AND l.locktype = 'advisory' AND NOT l.granted
      ) AS waiting`;
      return r.waiting;
    };
    const waitForBlockedOrSettled = async settled => {
      for (let n=0;n<80;n++) {
        if (await waiting()) return 'blocked';
        if (settled()) return 'settled';
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      return 'timeout';
    };
    await t.test('ordinary edit and profile enrollment serialize before either can claim the contact',async()=>{
      await reset();let release,entered;
      const gate=new Promise(resolve=>{release=resolve;});const ready=new Promise(resolve=>{entered=resolve;});
      const edit=db.$transaction(async tx=>{
        await safety.assertOrdinaryOrderContact(tx,profile);entered();await gate;
        await tx.customer.create({data:{fullName:profile.customerName,normalizedFullName:profile.customerName.toLowerCase(),phone:profile.customerPhone,normalizedPhone:profile.customerPhone,email:profile.customerEmail,normalizedEmail:profile.customerEmail,addressLine1:profile.addressLine1,city:profile.city,province:profile.province}});
      },{timeout:10000});
      await ready;let settled=false;
      const enrollment=Promise.allSettled([safety.enrollSyntheticProfile(db,actor,input())]).then(result=>{settled=true;return result;});
      let state;
      try { state=await waitForBlockedOrSettled(()=>settled); }
      finally { release();await edit; }
      const [result]=await enrollment;
      assert.equal(state,'blocked');assert.equal(result.status,'rejected');
      assert.equal(await db.systemSetting.count(),0);assert.equal(await db.customer.count(),1);
    });
    await t.test('orders, email claims and enrollment recheck expiry after an actual lock wait',async()=>{
      for(const mode of ['order','email','enroll']) {
        await reset();let customerId;
        if(mode!=='enroll') {
          await safety.enrollSyntheticProfile(db,actor,input());
          if(mode==='email')customerId=(await call()).body.order.customerId;
        }
        const RealDate=Date,at=RealDate.now(),expiresAt=at+60000;let clock=at;
        if(mode!=='enroll')await write({...await read(),expiresAt:new RealDate(expiresAt).toISOString()});
        let release,entered;
        const gate=new Promise(resolve=>{release=resolve;});const ready=new Promise(resolve=>{entered=resolve;});
        const blocker=db.$transaction(async tx=>{
          await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text',safety.SYNTHETIC_ORDER_POLICY_KEY);
          entered();await gate;
        },{timeout:10000});
        await ready;
        global.Date=class extends RealDate { constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;} };
        let settled=false;
        const action=Promise.allSettled([mode==='enroll'
          ? safety.enrollSyntheticProfile(db,actor,input({expiresAt:new RealDate(expiresAt).toISOString()}))
          : db.$transaction(tx=>mode==='order'?safety.reserveSyntheticOrder(tx,profile,true):safety.claimSyntheticEmail(tx,customerId,'EMAIL',profile.customerEmail),{timeout:10000})
        ]).then(result=>{settled=true;return result;});
        let state,result;
        try {
          state=await waitForBlockedOrSettled(()=>settled);
          clock=expiresAt+1;release();await blocker;[result]=await action;
        } finally {
          release();try { await blocker;await action; } finally { global.Date=RealDate; }
        }
        assert.equal(state,'blocked');assert.equal(result.status,'rejected',mode+' expiry must be checked after waiting');
        if(mode==='enroll'){
          assert.equal(result.reason?.details?.code,'EXPIRY_ELAPSED');
          assert.equal(await db.systemSetting.count(),0);
        }
        else assert.equal((await read())[mode==='order'?'ordersCreated':'emailsClaimed'],0);
      }
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
