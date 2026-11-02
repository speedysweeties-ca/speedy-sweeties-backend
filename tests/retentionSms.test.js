const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sms = require('../dist/services/retentionSms.service');
const now = new Date('2026-10-30T16:00:00Z');
const anchor = new Date('2026-07-01T16:00:00Z');
const phone = '+15195550123';
const config = { mode:'TEST', account:'AC'+'a'.repeat(32), token:'synthetic-token', service:'MG'+'b'.repeat(32), webhookBase:'https://example.test/api/v1/retention-sms', suppressionKey:'synthetic-only-key-32-characters-long', startAt:new Date('2026-01-01'), limit:1, allowlist:[phone], body:'Speedy Sweeties: Hello. Reply STOP to unsubscribe.' };
function fixture() {
  const message = { id:'synthetic-message', customerId:'c', status:'DRY_RUN', phone, inactivityAnchorAt:anchor, attemptedAt:null, providerMessageId:null, providerStatus:null };
  const customer = { phone, smsMarketingOptOut:false, smsExpressConsentAt:null, orders:[{createdAt:anchor,deliveredAt:anchor}] };
  const rows = new Map();
  const db = {
    retentionMessage:{ findMany:async()=>[message], findUnique:async()=>({...message}), updateMany:async({where,data})=> { if(Object.entries(where).some(([k,v])=>message[k]!==v))return {count:0}; Object.assign(message,data); return {count:1}; }, update:async({data})=>Object.assign(message,data) },
    systemSetting:{ upsert:async({where,create})=>{if(!rows.has(where.key))rows.set(where.key,{...create});}, findUniqueOrThrow:async({where})=>rows.get(where.key),update:async({where,data})=>Object.assign(rows.get(where.key),data) },
    customer:{findUnique:async()=>customer,count:async()=>customer.smsMarketingOptOut?1:0,updateMany:async({data})=>Object.assign(customer,data)},
    privacyDeletionRequest:{count:async()=>0},
    $queryRaw:async()=>[]
  };
  // Serialize mock transactions; real row-lock concurrency has a separate PostgreSQL test.
  let chain=Promise.resolve(); db.$transaction=fn=>{const next=chain.then(()=>fn(db));chain=next.catch(()=>{});return next;};
  return { db,message,customer,rows };
}
test('dry run needs no credentials; sending fails closed on configuration',()=>{
  assert.equal(sms.retentionSmsConfig({}),null);
  assert.throws(()=>sms.retentionSmsConfig({RETENTION_SMS_MODE:'LIVE'}));
  assert.throws(()=>sms.retentionSmsConfig({RETENTION_SMS_MODE:'TYPO'}));
  const env={RETENTION_SMS_MODE:'TEST',RETENTION_SMS_ENABLED:'true',RETENTION_TWILIO_ACCOUNT_SID:config.account,RETENTION_TWILIO_AUTH_TOKEN:config.token,RETENTION_TWILIO_MESSAGING_SERVICE_SID:config.service,RETENTION_SMS_WEBHOOK_BASE:config.webhookBase,RETENTION_SMS_SUPPRESSION_KEY:config.suppressionKey,RETENTION_SMS_START_AT:'2026-10-30T00:00:00Z',RETENTION_SMS_APPROVED_BODY:config.body};
  assert.throws(()=>sms.retentionSmsConfig(env));
  assert.equal(sms.retentionSmsConfig({...env,RETENTION_SMS_TEST_NUMBERS:phone}).limit,10);
  assert.throws(()=>sms.retentionSmsConfig({...env,RETENTION_SMS_TEST_NUMBERS:phone,RETENTION_SMS_MAX_PER_RUN:'1000'}));
});
test('signature binds exact URL and every parameter, rejects tampering',()=>{
  const params={From:phone,Body:'STOP',AccountSid:config.account};const url=config.webhookBase+'/inbound';
  const sig=crypto.createHmac('sha1',config.token).update(url+Object.keys(params).sort().map(k=>k+params[k]).join('')).digest('base64');
  assert.equal(sms.validTwilioSignature(config.token,url,params,sig),true);
  assert.equal(sms.validTwilioSignature(config.token,url,{...params,Body:'START'},sig),false);
  assert.equal(sms.validTwilioSignature(config.token,url+'/wrong',params,sig),false);
  assert.equal(sms.validTwilioSignature(config.token,url,params,''),false);
});
test('Toronto quiet hours respect daylight saving offsets',()=>{
  assert.equal(sms.inRetentionWindow(new Date('2026-10-30T13:59:00Z')),false);
  assert.equal(sms.inRetentionWindow(new Date('2026-10-30T14:00:00Z')),true);
  assert.equal(sms.inRetentionWindow(new Date('2026-10-31T00:00:00Z')),false);
  assert.equal(sms.inRetentionWindow(new Date('2026-12-01T14:59:00Z')),false);
});
test('eligibility rejects returned, opted-out, changed phone and expired consent',()=>{
  const {customer}=fixture();assert.equal(sms.eligibleRetentionCustomer(customer,anchor,phone,now),true);
  assert.equal(sms.eligibleRetentionCustomer({...customer,smsMarketingOptOut:true},anchor,phone,now),false);
  assert.equal(sms.eligibleRetentionCustomer({...customer,phone:'+15195550999'},anchor,phone,now),false);
  assert.equal(sms.eligibleRetentionCustomer({...customer,orders:[{createdAt:now,deliveredAt:now}]},anchor,phone,now),false);
  assert.equal(sms.eligibleRetentionCustomer(customer,anchor,phone,new Date('2029-01-01')),false);
});
test('single claim prevents concurrent sends and accepted is not delivered',async()=>{
  const {db,message}=fixture();let calls=0;
  const transport=async(url,options)=>{calls++;assert.equal(options.redirect,'error'); const body=new URLSearchParams(options.body);assert.equal(body.get('To'),phone);assert.equal(body.get('MessagingServiceSid'),config.service);return {ok:true,status:201,json:async()=>({sid:'SM'+'c'.repeat(32),status:'queued'})};};
  await Promise.all([sms.sendRetentionMessages(db,config,transport,now),sms.sendRetentionMessages(db,config,transport,now)]);
  assert.equal(calls,1);assert.equal(message.status,'SENT');assert.equal(message.providerStatus,'queued');
});
test('timeout or malformed success is held without retry',async()=>{
  for(const transport of [async()=>{throw Error('private provider details');},async()=>({ok:true,status:201,json:async()=>({})})]){
    const {db,message}=fixture();let calls=0;const send=async(...a)=>{calls++;return transport(...a);};
    await sms.sendRetentionMessages(db,config,send,now);await sms.sendRetentionMessages(db,config,send,now);
    assert.equal(calls,1);assert.equal(message.providerStatus,'unknown');assert.equal(message.errorMessage,'SEND_OUTCOME_UNKNOWN');
  }
});
test('STOP suppresses future attempts and remains stopped',async()=>{
  const {db,customer}=fixture();await sms.suppressRetentionPhone(db,phone,config.suppressionKey,now);
  assert.equal(customer.smsMarketingOptOut,true);let calls=0;await sms.sendRetentionMessages(db,config,async()=>{calls++;},now);assert.equal(calls,0);
});
test('21610 rejection records suppression without retry',async()=>{
  const {db,message,customer}=fixture();await sms.sendRetentionMessages(db,config,async()=>({ok:false,status:400,json:async()=>({code:21610})}),now);
  assert.equal(message.providerStatus,'rejected');assert.equal(customer.smsMarketingOptOut,true);
});
test('signed delivery evidence resolves uncertain attempt; late callbacks cannot downgrade',async()=>{
  const {db,message}=fixture();await sms.sendRetentionMessages(db,config,async()=>{throw Error('timeout');},now);
  const p={MessageSid:'SM'+'c'.repeat(32),MessageStatus:'delivered'};
  await sms.recordRetentionDelivery(db,message.id,p,now);assert.equal(message.providerStatus,'delivered');
  await sms.recordRetentionDelivery(db,message.id,{...p,MessageStatus:'sent'},now);assert.equal(message.providerStatus,'delivered');
  await sms.recordRetentionDelivery(db,message.id,{...p,MessageSid:'SM'+'d'.repeat(32),MessageStatus:'failed'},now);assert.equal(message.providerStatus,'delivered');
});
test('callback preceding API response is preserved',async()=>{
  const {db,message}=fixture();const sid='SM'+'e'.repeat(32);
  await sms.sendRetentionMessages(db,config,async()=>{await sms.recordRetentionDelivery(db,message.id,{MessageSid:sid,MessageStatus:'delivered'},now);return {ok:true,status:201,json:async()=>({sid,status:'queued'})};},now);
  assert.equal(message.providerStatus,'delivered');
});
test('dry-run and quiet hours never invoke provider',async()=>{
  const {db}=fixture();let calls=0;const send=async()=>{calls++;};await sms.sendRetentionMessages(db,{...config,mode:'DRY_RUN'},send,now);await sms.sendRetentionMessages(db,config,send,new Date('2026-10-30T04:00:00Z'));assert.equal(calls,0);
});
test('real webhook routes authenticate STOP, reject unsigned/nested requests, and keep START suppressed',async()=>{
  const {db,customer}=fixture();global.__prisma=db;
  const express=require('express');const {once}=require('node:events');
  const app=express();app.use(express.urlencoded({extended:true}));app.use('/api/v1/retention-sms',require('../dist/routes/retentionSms.routes').default);
  const prior={...process.env};Object.assign(process.env,{RETENTION_SMS_WEBHOOK_BASE:config.webhookBase,RETENTION_TWILIO_AUTH_TOKEN:config.token,RETENTION_TWILIO_ACCOUNT_SID:config.account,RETENTION_SMS_SUPPRESSION_KEY:config.suppressionKey});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const local=`http://127.0.0.1:${server.address().port}/api/v1/retention-sms/inbound`;
  async function post(body,signed=true){const p={AccountSid:config.account,From:phone,...body};const sig=crypto.createHmac('sha1',config.token).update(config.webhookBase+'/inbound'+Object.keys(p).sort().map(k=>k+p[k]).join('')).digest('base64');return fetch(local,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Twilio-Signature':signed?sig:'invalid'},body:new URLSearchParams(p)});}
  try {
    assert.equal((await post({Body:'STOP'},false)).status,403);assert.equal(customer.smsMarketingOptOut,false);
    assert.equal((await post({'Body[nested]':'STOP'})).status,403);
    assert.equal((await post({Body:'STOP',OptOutType:'STOP'})).status,200);assert.equal(customer.smsMarketingOptOut,true);
    assert.equal((await post({Body:'START',OptOutType:'START'})).status,200);assert.equal(customer.smsMarketingOptOut,true);
    delete process.env.RETENTION_TWILIO_AUTH_TOKEN;assert.equal((await post({Body:'STOP'})).status,503);
  } finally {server.closeAllConnections();await new Promise(r=>server.close(r));for(const k of ['RETENTION_SMS_WEBHOOK_BASE','RETENTION_TWILIO_AUTH_TOKEN','RETENTION_TWILIO_ACCOUNT_SID','RETENTION_SMS_SUPPRESSION_KEY']){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}delete global.__prisma;}
});
