const assert = require('node:assert/strict');
const test = require('node:test');

const safety = require('../dist/services/syntheticOrderSafety.service');
const actor = {userId:'synthetic-owner',role:'ADMIN'};
const now = new Date('2030-01-01T00:00:00.000Z');
const profile = {customerName:'Synthetic Reviewer',customerPhone:'5195550188',customerEmail:'synthetic-reviewer@example.invalid',addressLine1:'1 Synthetic Street',city:'Guelph',province:'ON'};
const input = extra => ({profile,ownerConfirmedSynthetic:true,expiresAt:new Date(now.getTime()+86400000).toISOString(),maxOrders:6,maxEmails:3,...extra});
const conflict = code => error => error?.statusCode===409&&error?.details?.code===code;
const db = collisionCount => ({$transaction:async operation=>operation({
  $queryRawUnsafe:async()=>[],
  systemSetting:{findUnique:async()=>null},
  customer:{count:async()=>collisionCount}
})});

async function withConfiguration(value, operation) {
  const previous = {
    approved:process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL,
    admins:process.env.PRIVACY_ADMIN_USER_IDS,
    digest:process.env.PRIVACY_DIGEST_KEY
  };
  try {
    if(value===undefined)delete process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL;
    else process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL=value;
    process.env.PRIVACY_ADMIN_USER_IDS=actor.userId;
    process.env.PRIVACY_DIGEST_KEY='synthetic-reviewer-digest-only-not-live-789012';
    return await operation();
  } finally {
    if(previous.approved===undefined)delete process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL;else process.env.SYNTHETIC_REVIEWER_APPROVED_EMAIL=previous.approved;
    if(previous.admins===undefined)delete process.env.PRIVACY_ADMIN_USER_IDS;else process.env.PRIVACY_ADMIN_USER_IDS=previous.admins;
    if(previous.digest===undefined)delete process.env.PRIVACY_DIGEST_KEY;else process.env.PRIVACY_DIGEST_KEY=previous.digest;
  }
}

test('approved reviewer mailbox configuration fails closed without revealing values', async()=>{
  for(const configured of [undefined,'not-an-email','different@example.invalid']) {
    await withConfiguration(configured,()=>assert.rejects(
      safety.validateSyntheticEnrollmentProfile(db(0),actor,input(),now),
      conflict('ENROLLMENT_PRECONDITION')
    ));
  }
});

test('configured exact mailbox validates read-only and collision still wins', async()=>{
  await withConfiguration(profile.customerEmail,async()=>{
    assert.deepEqual(await safety.validateSyntheticEnrollmentProfile(db(0),actor,input(),now),{eligible:true});
    await assert.rejects(
      safety.validateSyntheticEnrollmentProfile(db(1),actor,input(),now),
      conflict('PROFILE_COLLISION')
    );
  });
});
