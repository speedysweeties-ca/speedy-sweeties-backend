const test = require('node:test');
const assert = require('node:assert/strict');
const enabled=process.env.CHECK_RETENTION_SMS_DATABASE==='1';

// Hold an uncommitted recipient insert until both independent workers are
// waiting on it in PostgreSQL. This reproduces the first-insert race without
// relying on which worker happens to run first or on arbitrary sleep delays.
async function withContendedRecipient(db, key, value, work) {
  const inserted = Promise.withResolvers();
  const release = Promise.withResolvers();
  const seed = db.$transaction(async tx => {
    await tx.systemSetting.create({data:{key,value}});
    inserted.resolve();
    await release.promise;
  }, {timeout:10000});
  seed.catch(inserted.reject);
  let workers;
  try {
    await inserted.promise;
    workers = Promise.allSettled(work());
    const deadline = Date.now() + 3000;
    let waiting = 0;
    while (Date.now() < deadline) {
      const [row] = await db.$queryRaw`SELECT count(*)::int AS waiting
        FROM pg_stat_activity WHERE datname = current_database()
        AND wait_event_type = 'Lock' AND query LIKE '%INSERT INTO%SystemSetting%'`;
      waiting = row.waiting;
      if (waiting >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(waiting, 2, 'both workers must contend on the uncommitted recipient');
  } finally {
    release.resolve();
    await seed;
    if (workers) {
      const results = await workers;
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
      }
    }
  }
}

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
    await withContendedRecipient(db,key,'{"optedOut":false}',()=>[
      sms.sendRetentionMessages(db,config,transport,now),
      sms.sendRetentionMessages(other,config,transport,now)
    ]);
    assert.equal(calls,1);const sent=await db.retentionMessage.findUniqueOrThrow({where:{id}});assert.equal(sent.providerStatus,'queued');assert.equal(sent.status,'SENT');
    await sms.sendRetentionMessages(other,config,transport,now);assert.equal(calls,1);
    await sms.suppressRetentionPhone(other,phone,config.suppressionKey,now);
    assert.equal((await db.customer.findUniqueOrThrow({where:{id}})).smsMarketingOptOut,true);
    assert.equal(JSON.parse((await db.systemSetting.findUniqueOrThrow({where:{key}})).value).optedOut,true);
    await sms.sendRetentionMessages(other,config,transport,now);assert.equal(calls,1);
    await sms.recordRetentionDelivery(db,id,{MessageSid:sent.providerMessageId,MessageStatus:'delivered'},now);
    await sms.recordRetentionDelivery(other,id,{MessageSid:sent.providerMessageId,MessageStatus:'queued'},now);
    assert.equal((await db.retentionMessage.findUniqueOrThrow({where:{id}})).providerStatus,'delivered');

    // Initial concurrent STOP callbacks use the same safe creation path.
    // Existing suppression metadata must survive a conflict, never reset.
    await db.systemSetting.delete({where:{key}});
    const lastAttemptAt = now.toISOString();
    await withContendedRecipient(db,key,JSON.stringify({optedOut:true,lastAttemptAt}),()=>[
      sms.suppressRetentionPhone(db,phone,config.suppressionKey,now),
      sms.suppressRetentionPhone(other,phone,config.suppressionKey,now)
    ]);
    assert.deepEqual(JSON.parse((await db.systemSetting.findUniqueOrThrow({where:{key}})).value),{optedOut:true,lastAttemptAt});
  } finally {
    await db.retentionMessage.deleteMany({where:{customerId:id}});await db.order.deleteMany({where:{id}});await db.customer.deleteMany({where:{id}});await db.systemSetting.deleteMany({where:{key}});await db.$disconnect();await other.$disconnect();
  }
});
