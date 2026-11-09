const test = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://unused:unused@127.0.0.1:5432/unused';
process.env.JWT_SECRET ||= 'synthetic-unit-key-only';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||= '{}';
const {assertSyntheticLoyaltyCredentialActive, syntheticCredentialRevocationKey, revokeExposedSyntheticCredentials} = require('../dist/services/syntheticCredentialRevocation.service');
const record = {version:1,event:'EXPOSED_SYNTHETIC_CREDENTIALS_REVOKED',sourceOrderId:'00000000-0000-4000-8000-000000000001',actorId:'synthetic-owner',revokedAt:'2030-01-01T00:00:00.000Z',loyaltyIssuedThrough:1893456000};
const revoked = e => e.statusCode === 401;

test('subject-scoped cutoff rejects old, same-second and missing-iat tokens while preserving fresh and unrelated credentials', async()=>{
  const db={systemSetting:{async findUnique({where}){return where.key===syntheticCredentialRevocationKey('test-subject')?{value:JSON.stringify(record)}:null;}}};
  for(const iat of [undefined,NaN,1.2,record.loyaltyIssuedThrough-1,record.loyaltyIssuedThrough])
    await assert.rejects(assertSyntheticLoyaltyCredentialActive(db,{sub:'test-subject',scope:'customer-loyalty',iat}),revoked);
  await assertSyntheticLoyaltyCredentialActive(db,{sub:'test-subject',scope:'customer-loyalty',iat:record.loyaltyIssuedThrough+1});
  await assertSyntheticLoyaltyCredentialActive(db,{sub:'ordinary-subject',scope:'customer-loyalty'});
});

test('corrupt target tombstones fail closed and database interruption cannot bypass revocation', async()=>{
  for(const value of ['not-json','{}',JSON.stringify({...record,loyaltyIssuedThrough:-1}),JSON.stringify({...record,event:'other'})])
    await assert.rejects(assertSyntheticLoyaltyCredentialActive({systemSetting:{findUnique:async()=>({value})}},{sub:'test-subject',scope:'customer-loyalty',iat:record.loyaltyIssuedThrough+1}),revoked);
  await assert.rejects(assertSyntheticLoyaltyCredentialActive({systemSetting:{findUnique:async()=>{throw Error('database unavailable');}}},{sub:'test-subject',scope:'customer-loyalty',iat:record.loyaltyIssuedThrough+1}),/database unavailable/);
});

test('revocation requires singleton owner and exact bounded body before any transaction',async()=>{
  const prior=process.env.PRIVACY_ADMIN_USER_IDS;process.env.PRIVACY_ADMIN_USER_IDS='synthetic-owner';
  const db={$transaction:async()=>assert.fail('unexpected transaction')};
  try{
    for(const actor of [undefined,{userId:'other',role:'ADMIN'},{userId:'synthetic-owner',role:'DISPATCHER'}])
      await assert.rejects(revokeExposedSyntheticCredentials(db,actor,{}),e=>e.statusCode===403);
    const actor={userId:'synthetic-owner',role:'ADMIN'};
    for(const body of [{},{ownerConfirmedSynthetic:true,expectedExpiresAt:'2030-01-02T00:00:00.000Z',expectedOrdersCreated:1,expectedEmailsClaimed:2,customerId:'ordinary'},
      {ownerConfirmedSynthetic:true,expectedExpiresAt:'2030-01-02T00:00:00.000Z',expectedOrdersCreated:2,expectedEmailsClaimed:2}])
      await assert.rejects(revokeExposedSyntheticCredentials(db,actor,body),e=>e.statusCode===400);
    process.env.PRIVACY_ADMIN_USER_IDS='synthetic-owner,other';
    await assert.rejects(revokeExposedSyntheticCredentials(db,actor,{}),e=>e.statusCode===403);
  }finally{if(prior===undefined)delete process.env.PRIVACY_ADMIN_USER_IDS;else process.env.PRIVACY_ADMIN_USER_IDS=prior;}
});

test('HTTP revocation route enforces existing session/ADMIN guards and singleton owner before accepting scope',async t=>{
  const express=require('express');
  const {prisma}=require('../dist/lib/prisma');
  const {signAuthToken}=require('../dist/utils/jwt');
  const routes=require('../dist/routes/orders').default;
  const {errorHandler}=require('../dist/middleware/errorHandler');
  const old=prisma.user.findUnique,oldIds=process.env.PRIVACY_ADMIN_USER_IDS;
  let role='ADMIN',isActive=true;
  prisma.user.findUnique=async()=>({id:'synthetic-route-owner',email:'owner@example.invalid',role,isActive,passwordChangeRequired:false,forceLogoutAt:null,authVersion:0});
  process.env.PRIVACY_ADMIN_USER_IDS='synthetic-route-owner';
  t.after(()=>{prisma.user.findUnique=old;if(oldIds===undefined)delete process.env.PRIVACY_ADMIN_USER_IDS;else process.env.PRIVACY_ADMIN_USER_IDS=oldIds;});
  const app=express();app.use(express.json());app.use('/orders',routes);app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  const token=signAuthToken({userId:'synthetic-route-owner',email:'owner@example.invalid',role:'ADMIN',authVersion:0});
  const call=async(auth=true)=>fetch(`http://127.0.0.1:${server.address().port}/orders/synthetic-safety/revoke-exposed-credentials`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:'{}'});
  assert.equal((await call(false)).status,401);
  isActive=false;assert.equal((await call()).status,401);isActive=true;
  role='DISPATCHER';assert.equal((await call()).status,403);role='ADMIN';
  process.env.PRIVACY_ADMIN_USER_IDS='another-owner';assert.equal((await call()).status,403);
  process.env.PRIVACY_ADMIN_USER_IDS='synthetic-route-owner';
  const response=await call();assert.equal(response.status,400);assert.equal(response.headers.get('cache-control'),'no-store');
});
