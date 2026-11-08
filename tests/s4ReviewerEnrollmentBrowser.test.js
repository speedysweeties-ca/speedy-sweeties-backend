const assert = require('node:assert/strict');
const test = require('node:test');
const workflow = require('../scripts/s4ReviewerEnrollmentBrowser');

const profile = () => ({customerName:'Synthetic Reviewer',customerPhone:'5195550100',customerEmail:'reviewer@example.invalid',addressLine1:'1 Test Street',city:'Guelph',province:'ON',unitNumber:'',buzzCode:''});
const startedAt = Date.parse('2030-01-01T00:00:00.000Z');
const approval = {executionId:'synthetic-execution',liveEnrollmentAuthorized:true,currentSourceVerified:true,
  sourceRevision:'a'.repeat(40),startedAt:new Date(startedAt).toISOString(),deadline:new Date(startedAt+12*3600000).toISOString(),
  expiresAt:new Date(startedAt+7*86400000).toISOString(),maxOrders:6,maxEmails:3};
const response = (status,body) => ({status,json:async()=>body});
const options = extra => ({approval,profile:profile(),token:'not-a-real-token',api:'https://example.invalid',now:()=>startedAt+1000,
  timeoutSignal:()=>undefined,confirmEnrollment:async()=>true,markOneUse:()=>{},...extra});

test('browser workflow sends byte-identical private profile to validation and enrollment', async()=>{
  const bodies=[];
  const result=await workflow.execute(options({fetchImpl:async(url,request)=>{
    bodies.push({url,body:request.body});
    return bodies.length===1?response(200,{success:true,eligible:true}):response(201,{success:true,state:'ACTIVE',maxOrders:6,maxEmails:3,ordersCreated:0,emailsClaimed:0,expiresAt:approval.expiresAt});
  }}));
  assert.equal(result.pass,true);assert.equal(bodies.length,2);assert.equal(bodies[0].body,bodies[1].body);
  assert.deepEqual(JSON.parse(bodies[0].body),{ownerConfirmedSynthetic:true,profile:profile(),expiresAt:approval.expiresAt,maxOrders:6,maxEmails:3});
  assert.equal(JSON.stringify(result).includes('reviewer@example.invalid'),false);
});

test('safe ADMIN refusal categories stop before enrollment and do not expose response data', async()=>{
  for(const category of workflow.SAFE_CONFLICTS){
    let calls=0;
    const result=await workflow.execute(options({fetchImpl:async()=>{calls++;return response(409,{details:{code:category},ignoredPrivateValue:'do-not-emit'});}}));
    assert.deepEqual(result,{pass:false,status:409,category,result:'STOP_VALIDATION_REFUSED',enrollmentAttempted:false});
    assert.equal(calls,1);assert.equal(JSON.stringify(result).includes('do-not-emit'),false);
  }
});

test('scope, local structure and cancellation fail closed', async()=>{
  assert.equal((await workflow.execute(options({approval:{...approval,maxEmails:4},fetchImpl:async()=>assert.fail()}))).result,'STOP_SCOPE_OR_PERIOD');
  await assert.rejects(workflow.execute(options({profile:{...profile(),city:'Elsewhere'},fetchImpl:async()=>assert.fail()})),/PRIVATE_PROFILE_STRUCTURE/);
  let calls=0;
  const result=await workflow.execute(options({confirmEnrollment:async()=>false,fetchImpl:async()=>{calls++;return response(200,{success:true,eligible:true});}}));
  assert.equal(result.result,'CANCELLED_AFTER_VALIDATION');assert.equal(calls,1);
});
