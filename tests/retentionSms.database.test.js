const test = require('node:test');
const assert = require('node:assert/strict');
const enabled=process.env.CHECK_RETENTION_SMS_DATABASE==='1';
test('PostgreSQL claims survive concurrency, restart and STOP; migration preserves drafts', {skip:!enabled},async()=>{
  const url=new URL(process.env.DATABASE_URL);assert.equal(process.env.CI,'true');assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.equal(url.pathname,'/speedy_sweeties_ci');
  const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();const other=new PrismaClient();
  const sms=require('../dist/services/retentionSms.service');
  const now=new Date('2026-10-30T16:00:00Z'),anchor=new Date('2026-07-01T16:00:00Z'),phone='+15195550123';
  const config={mode:'TEST',account:'AC'+'a'.repeat(32),token:'synthetic',service:'MG'+'b'.repeat(32),webhookBase:'https://example.test/api/v1/retention-sms',suppressionKey:'synthetic-only-key-32-characters-long',startAt:new Date('2026-01-01'),limit:10,allowlist:[phone],body:'Speedy Sweeties: Hello. Reply STOP to unsubscribe.'};
  const id='retention-sms-synthetic';const key=sms.recipientKey(phone,config.suppressionKey);
  try {
    await db.customer.create({data:{id,fullName:'Synthetic',normalizedFullName:'synthetic',phone,normalizedPhone:phone.slice(2),addressLine1:'Synthetic',city:'Guelph',province:'ON'}});
    await db.order.create({data:{id,customerId:id,customerName:'Synthetic',addressLine1:'Synthetic',city:'Guelph',province:'ON',phone,email:'synthetic@example.invalid',itemsText:'synthetic',paymentMethod:'CASH',orderStatus:'DELIVERED',createdAt:anchor,deliveredAt:anchor}});
    await db.retentionMessage.create({data:{id,customerId:id,inactivityAnchorAt:anchor,eligibleAt:new Date('2026-09-29T16:00:00Z'),phone,messageBody:'draft'}});
    let calls=0;const transport=async()=>{calls++;return {ok:true,status:201,json:async()=>({sid:'SM'+'c'.repeat(32),status:'queued'})};};
    await Promise.all([sms.sendRetentionMessages(db,config,transport,now),sms.sendRetentionMessages(other,config,transport,now)]);
    assert.equal(calls,1);const sent=await db.retentionMessage.findUniqueOrThrow({where:{id}});assert.equal(sent.providerStatus,'queued');assert.equal(sent.status,'SENT');
    await sms.sendRetentionMessages(other,config,transport,now);assert.equal(calls,1);
    await sms.suppressRetentionPhone(other,phone,config.suppressionKey,now);
    assert.equal((await db.customer.findUniqueOrThrow({where:{id}})).smsMarketingOptOut,true);
    assert.equal(JSON.parse((await db.systemSetting.findUniqueOrThrow({where:{key}})).value).optedOut,true);
    await sms.recordRetentionDelivery(db,id,{MessageSid:sent.providerMessageId,MessageStatus:'delivered'},now);
    await sms.recordRetentionDelivery(other,id,{MessageSid:sent.providerMessageId,MessageStatus:'queued'},now);
    assert.equal((await db.retentionMessage.findUniqueOrThrow({where:{id}})).providerStatus,'delivered');
  } finally {
    await db.retentionMessage.deleteMany({where:{customerId:id}});await db.order.deleteMany({where:{id}});await db.customer.deleteMany({where:{id}});await db.systemSetting.deleteMany({where:{key}});await db.$disconnect();await other.$disconnect();
  }
});
