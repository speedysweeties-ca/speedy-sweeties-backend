const test = require('node:test');
const assert = require('node:assert/strict');
const {randomBytes,randomUUID} = require('node:crypto');
const enabled=process.env.REVIEWER_SAFETY_SYNTHETIC==='yes';

test('targeted credential revocation and fresh reviewer handoff on real isolated PostgreSQL', {skip:!enabled}, async t=>{
  assert.equal(process.env.NODE_ENV,'test');
  const url=new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/reviewer_safety_synthetic');
  assert.ok(['5432','55476'].includes(url.port));
  const {prisma:db}=require('../dist/lib/prisma');
  const safety=require('../dist/services/syntheticOrderSafety.service');
  const {revokeExposedSyntheticCredentials:revoke,syntheticCredentialRevocationKey:key}=require('../dist/services/syntheticCredentialRevocation.service');
  const business=require('../dist/controllers/business.controller');
  const geocoding=require('../dist/services/deliveryGeocoding.service');
  const dispatch=require('../dist/services/autoDispatchPickupPlan.service');
  const loyalty=require('../dist/services/loyalty.service');
  const {createSyntheticOrderController,createOrderController,getPublicOrderTrackingByTokenController}=require('../dist/controllers/order.controller');
  const {getCustomerLoyaltyByTokenController}=require('../dist/controllers/customer.controller');
  const {findCheckInOrder}=require('../dist/services/deliveryCheckIn.service');
  const {PrivacyDeletionService}=require('../dist/services/privacyDeletion.service');
  const {verifyCustomerLoyaltyToken}=require('../dist/utils/jwt');
  const actor={userId:'synthetic-owner',role:'ADMIN'};
  const profile={customerName:'Synthetic Revocation Reviewer',customerPhone:'5195550119',customerEmail:'revocation@example.invalid',addressLine1:'1 Synthetic Street',city:'Guelph',province:'ON'};
  const corrected={...profile,addressLine1:'2 Synthetic Street'};
  const oldEmail=process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL;
  process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL=profile.customerEmail;
  t.after(()=>{if(oldEmail===undefined)delete process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL;else process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL=oldEmail;});
  const replace=(obj,name,fn)=>{const previous=obj[name];obj[name]=fn;t.after(()=>obj[name]=previous);};
  replace(business,'isBusinessConfirmedClosed',async()=>false);
  replace(geocoding,'geocodeDeliveryAddress',async()=>({geocodeStatus:'VERIFIED',deliveryLatitude:43.5,deliveryLongitude:-80.2}));
  replace(dispatch,'autoDispatchCreatedOrderWithPickupPlan',async()=>({dispatched:false,reason:'AUTO_DISPATCH_DISABLED'}));
  replace(loyalty,'sendCustomerLoyaltyNotification',async()=>{});
  const res=()=>({code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
  const callOrder=async(p=corrected,controller=createSyntheticOrderController)=>{
    const r=res();await controller({body:{...p,paymentMethod:'CASH',orderSource:'IOS_APP',items:[{name:'Synthetic readiness item',quantity:1,unitPrice:0}]},headers:{}},r);return r.body;
  };
  const rewards=async(token)=>{const r=res();await getCustomerLoyaltyByTokenController({headers:{authorization:'Bearer '+token}},r);return r;};
  const track=async(token)=>{const r=res();await getPublicOrderTrackingByTokenController({params:{token}},r);return r;};
  const policy=async()=>db.systemSetting.findUniqueOrThrow({where:{key:safety.SYNTHETIC_ORDER_POLICY_KEY}});
  const clear=async()=>{
    await db.privacyAudit.deleteMany();await db.privacyDeletionRequest.deleteMany();await db.privacyAccessCredential.deleteMany();await db.privacyChallenge.deleteMany();
    await db.orderItem.deleteMany();await db.order.deleteMany();await db.itemCatalog.deleteMany();await db.customer.deleteMany();await db.systemSetting.deleteMany();
  };
  const seed=async()=>{
    await clear();
    await safety.enrollSyntheticProfile(db,actor,{profile,ownerConfirmedSynthetic:true,expiresAt:new Date(Date.now()+86400000).toISOString(),maxOrders:6,maxEmails:3});
    await safety.correctUnusedSyntheticProfileAddress(db,actor,{ownerConfirmedSynthetic:true,currentProfile:profile,correctedProfile:corrected});
    const order=await callOrder();
    const sent=new Map();let sends=0;
    const svc=new PrivacyDeletionService(db,process.env.PRIVACY_DIGEST_KEY,{async start(m){sends++;sent.set(m.id,m.code);return {reference:'synthetic-provider'};},async check(){assert.fail('no SMS');}},()=>false,'within 30 days','12-31',await require('./privacyRecoveryFixture.cjs').syntheticJournal(process.env.PRIVACY_DIGEST_KEY));
    await svc.challenge({trackingToken:order.trackingToken},'fixture-ip');
    const challenge=await svc.challenge({trackingToken:order.trackingToken},'fixture-ip');
    const accessToken=randomBytes(32).toString('hex');
    await svc.verify(challenge.challengeId,sent.get(challenge.challengeId),accessToken);
    const row=await policy(),p=JSON.parse(row.value);
    const body={ownerConfirmedSynthetic:true,expectedExpiresAt:p.expiresAt,expectedOrdersCreated:1,expectedEmailsClaimed:2};
    return {order,svc,accessToken,body,row,p,sent,sends:()=>sends};
  };
  try{
    await t.test('atomic revocation blocks original tracking and both loyalty uses, preserves all other data and private access',async()=>{
      const f=await seed();const id=f.order.order.id;
      assert.equal((await rewards(f.order.loyaltyAccessToken)).code,200);
      const beforeCustomer=await db.customer.findUniqueOrThrow({where:{id:f.p.customerId}});
      const beforeOrder=await db.order.findUniqueOrThrow({where:{id}});
      const beforeAccess=await db.privacyAccessCredential.findMany();const beforeChallenges=await db.privacyChallenge.findMany({orderBy:{id:'asc'}});
      assert.equal((await track(f.order.trackingToken)).code,200);
      const result=await revoke(db,actor,f.body);
      assert.equal(result.trackingRevoked,true);assert.equal(result.priorLoyaltyRevoked,true);
      assert.equal((await policy()).value,f.row.value);
      assert.deepEqual(await db.customer.findUniqueOrThrow({where:{id:f.p.customerId}}),beforeCustomer);
      const afterOrder=await db.order.findUniqueOrThrow({where:{id}});
      assert.equal(afterOrder.trackingTokenHash,null);assert.equal(afterOrder.trackingTokenExpiresAt,null);
      for(const field of Object.keys(beforeOrder).filter(k=>!['trackingTokenHash','trackingTokenExpiresAt','updatedAt'].includes(k)))assert.deepEqual(afterOrder[field],beforeOrder[field],field);
      assert.deepEqual(await db.privacyAccessCredential.findMany(),beforeAccess);
      assert.deepEqual(await db.privacyChallenge.findMany({orderBy:{id:'asc'}}),beforeChallenges);
      assert.equal((await track(f.order.trackingToken)).code,404);
      await assert.rejects(findCheckInOrder(f.order.trackingToken),e=>e.statusCode===404);
      assert.equal((await rewards(f.order.loyaltyAccessToken)).code,401);
      for(const credential of [{trackingToken:f.order.trackingToken},{loyaltyToken:f.order.loyaltyAccessToken}])
        await assert.rejects(f.svc.challenge(credential,'fixture-ip'),e=>e.status===401);
      assert.equal(f.sends(),2);assert.equal(await db.privacyChallenge.count(),2);
      assert.equal((await policy()).value,f.row.value);assert.equal(await db.privacyDeletionRequest.count(),0);
      const tombstone=JSON.parse((await db.systemSetting.findUniqueOrThrow({where:{key:key(f.p.customerId)}})).value);
      assert.equal(tombstone.event,'EXPOSED_SYNTHETIC_CREDENTIALS_REVOKED');
      for(const value of [profile.customerName,profile.customerPhone,profile.customerEmail,corrected.addressLine1,f.order.trackingToken,f.order.loyaltyAccessToken,f.accessToken])assert.equal(JSON.stringify(tombstone).includes(value),false);
      // Existing independent privacy access still resolves its original order by ID.
      await f.svc.atomic(async tx=>{const resolved=await f.svc.bootstrap(tx,{accessToken:f.accessToken});assert.equal(resolved.accessId,beforeAccess[0].id);});
      assert.equal((await policy()).value,f.row.value);assert.equal(f.sends(),2);
    });
    await t.test('fresh protected app order and email verification remain usable; ordinary credentials are unaffected',async()=>{
      const f=await seed();
      const ordinary=await callOrder({...profile,customerName:'Ordinary Fixture',customerPhone:'5195550129',customerEmail:'ordinary-revocation@example.invalid'},createOrderController);
      await revoke(db,actor,f.body);
      assert.equal((await track(ordinary.trackingToken)).code,200);assert.equal((await rewards(ordinary.loyaltyAccessToken)).code,200);
      const tombstone=JSON.parse((await db.systemSetting.findUniqueOrThrow({where:{key:key(f.p.customerId)}})).value);
      // JWT iat has second resolution. Tokens issued in the revocation second also
      // fail closed; a subsequent reviewer session starts after that boundary.
      await new Promise(resolve=>setTimeout(resolve,Math.max(0,(tombstone.loyaltyIssuedThrough+1)*1000-Date.now()+20)));
      const fresh=await callOrder();assert.equal(fresh.order.orderStatus,'CANCELLED');
      assert.ok(verifyCustomerLoyaltyToken(fresh.loyaltyAccessToken).iat>tombstone.loyaltyIssuedThrough);
      assert.equal((await rewards(fresh.loyaltyAccessToken)).code,200);
      const challenge=await f.svc.challenge({loyaltyToken:fresh.loyaltyAccessToken},'fresh-fixture-ip');
      assert.equal(challenge.channel,'EMAIL');assert.equal(f.sends(),3);
      const verified=await f.svc.verify(challenge.challengeId,f.sent.get(challenge.challengeId),randomBytes(32).toString('hex'));
      assert.match(verified.proof,/^[a-f0-9]{64}$/);
      const p=JSON.parse((await policy()).value);assert.equal(p.ordersCreated,2);assert.equal(p.emailsClaimed,3);assert.equal(p.expiresAt,f.p.expiresAt);
      assert.equal((await rewards(f.order.loyaltyAccessToken)).code,401);assert.equal((await track(f.order.trackingToken)).code,404);
      assert.equal(await db.privacyDeletionRequest.count(),0);
    });
    await t.test('stale counts, changed expiry, closed/expired policy and non-synthetic or linked activity refuse without writes',async()=>{
      const f=await seed();
      for(const patch of [{expectedExpiresAt:new Date(Date.now()+1000).toISOString()}])await assert.rejects(revoke(db,actor,{...f.body,...patch}),e=>e.statusCode===409);
      const raw=f.row.value;
      for(const patch of [{state:'CLOSED'},{expiresAt:new Date(0).toISOString()},{ordersCreated:2},{emailsClaimed:3},{customerId:null},{addressCorrectionAudit:undefined}]){
        await db.systemSetting.update({where:{key:safety.SYNTHETIC_ORDER_POLICY_KEY},data:{value:JSON.stringify({...f.p,...patch})}});
        await assert.rejects(revoke(db,actor,f.body),e=>e.statusCode===409);
        assert.equal(await db.systemSetting.count({where:{key:key(f.p.customerId)}}),0);
        assert.notEqual((await db.order.findUnique({where:{id:f.order.order.id}})).trackingTokenHash,null);
      }
      await db.systemSetting.update({where:{key:safety.SYNTHETIC_ORDER_POLICY_KEY},data:{value:raw}});
      await db.order.update({where:{id:f.order.order.id},data:{cancellationReason:'Ordinary cancelled order'}});
      await assert.rejects(revoke(db,actor,f.body),e=>e.statusCode===409);
      await db.order.update({where:{id:f.order.order.id},data:{cancellationReason:safety.SYNTHETIC_CANCELLATION_REASON}});
      await db.customer.update({where:{id:f.p.customerId},data:{fullName:'Changed fixture'}});
      await assert.rejects(revoke(db,actor,f.body),e=>e.statusCode===409);
      assert.equal(await db.systemSetting.count({where:{key:key(f.p.customerId)}}),0);
    });
    await t.test('tracking update failure rolls back tombstone and repeated/concurrent revocations cannot rearm',async()=>{
      const f=await seed();
      const failing={$transaction:(work,options)=>db.$transaction(tx=>work(new Proxy(tx,{get(target,prop){return prop==='order'?new Proxy(tx.order,{get(order,name){return name==='update'?async()=>{throw Error('injected rollback');}:order[name];}}):target[prop];}})),options)};
      await assert.rejects(revoke(failing,actor,f.body),/injected rollback/);
      assert.equal(await db.systemSetting.count({where:{key:key(f.p.customerId)}}),0);
      assert.notEqual((await db.order.findUnique({where:{id:f.order.order.id}})).trackingTokenHash,null);
      const results=await Promise.allSettled([revoke(db,actor,f.body),revoke(db,actor,f.body)]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(await db.systemSetting.count({where:{key:key(f.p.customerId)}}),1);
      const after=await db.systemSetting.findUniqueOrThrow({where:{key:key(f.p.customerId)}});
      await assert.rejects(revoke(db,actor,f.body),e=>e.statusCode===409);
      assert.deepEqual(await db.systemSetting.findUniqueOrThrow({where:{key:key(f.p.customerId)}}),after);
      assert.equal((await policy()).value,f.row.value);
    });
    await t.test('email and order attempts waiting behind revocation recheck under real locks',async()=>{
      for(const kind of ['email','order']){
        const f=await seed();let heldResolve,releaseResolve;
        const held=new Promise(r=>heldResolve=r),release=new Promise(r=>releaseResolve=r);
        const delayed={$transaction:(work,options)=>db.$transaction(async tx=>{await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(2601022)');heldResolve();await release;return work(tx);},options)};
        const revocation=revoke(delayed,actor,f.body);await held;
        const pending=kind==='email'?f.svc.challenge({loyaltyToken:f.order.loyaltyAccessToken},'concurrent-fixture-ip'):callOrder();
        const outcome=Promise.allSettled([revocation,pending]);releaseResolve();const results=await outcome;
        assert.equal(results[0].status,'fulfilled');
        if(kind==='email'){assert.equal(results[1].status,'rejected');assert.equal(f.sends(),2);assert.equal((await policy()).value,f.row.value);}
        else {assert.equal(results[1].status,'fulfilled');assert.equal(JSON.parse((await policy()).value).ordersCreated,2);}
        assert.equal((await rewards(f.order.loyaltyAccessToken)).code,401);
      }
    });
  }finally{await clear();await db.$disconnect();}
});
