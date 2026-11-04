const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac,randomUUID}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {INTAKE_POLICY,INTAKE_GRANT_MS,readIntakeGrant,signIntakeGrant}=require('../dist/services/privacyIntakeGrant');
const mac=s=>createHmac('sha256','synthetic-intake-only').update(s).digest('hex');
const now=Date.now(),claims={v:1,policy:INTAKE_POLICY,id:randomUUID(),actorId:randomUUID(),authVersion:0,scopeHash:'1'.repeat(64),destinationHash:'2'.repeat(64),fingerprint:'3'.repeat(64),reviewHash:'4'.repeat(64),receivedAt:new Date(now-1000).toISOString(),method:'PRIOR_PERSONAL_RECOGNITION',issuedAt:now,expiresAt:now+INTAKE_GRANT_MS};
test('R13 every signed claim rejects unauthorized mutation',()=>{
 const grant=signIntakeGrant(claims,mac);assert.deepEqual(readIntakeGrant(grant,mac,now),claims);
 for(const [key,value] of Object.entries({v:2,policy:'DRAFT',id:randomUUID(),actorId:randomUUID(),authVersion:1,scopeHash:'5'.repeat(64),destinationHash:'6'.repeat(64),fingerprint:'7'.repeat(64),reviewHash:'8'.repeat(64),receivedAt:new Date(now-2000).toISOString(),method:'HISTORICAL_VERIFIED_EMAIL',priorChallengeId:randomUUID(),issuedAt:now-1,expiresAt:now+1})){
  const parts=grant.split('.');parts[1]=Buffer.from(JSON.stringify({...claims,[key]:value})).toString('base64url');assert.equal(readIntakeGrant(parts.join('.'),mac,now),null,key);
 }
});
test('R14 exact expiry, malformed tokens, future issue and altered lifetime refuse',()=>{
 const grant=signIntakeGrant(claims,mac);assert.equal(readIntakeGrant(grant,mac,claims.expiresAt-1).id,claims.id);assert.equal(readIntakeGrant(grant,mac,claims.expiresAt),null);
 for(const token of ['', 'ordinary-private-access-token',grant+'.suffix','x'.repeat(4097)])assert.equal(readIntakeGrant(token,mac,now),null);
 for(const changed of [{...claims,issuedAt:now+1,expiresAt:now+1+INTAKE_GRANT_MS},{...claims,expiresAt:now+1000},{...claims,priorChallengeId:randomUUID()},{...claims,method:'HISTORICAL_VERIFIED_EMAIL'}])assert.equal(readIntakeGrant(signIntakeGrant(changed,mac),mac,now),null);
});
test('R29 shared Prisma diagnostics exclude arguments, rows, contacts and tokens',()=>{
 const code=`const Module=require('node:module');const load=Module._load;const events={};let options;Module._load=function(name,...rest){if(name==='@prisma/client')return {PrismaClient:class{constructor(o){options=o;} $on(n,fn){events[n]=fn;}}};return load.call(this,name,...rest);};const output=[];console.error=console.warn=(...a)=>output.push(a.join(' '));require('./dist/lib/prisma');for(const fn of Object.values(events))fn({message:'PRIVATE_CONTACT_CANARY PRIVATE_GRANT_CANARY PRIVATE_CODE_CANARY',query:'PRIVATE_QUERY_CANARY',params:'PRIVATE_PARAMETERS_CANARY'});require('node:assert/strict').deepEqual(options.log,[{level:'warn',emit:'event'},{level:'error',emit:'event'}]);process.stdout.write(JSON.stringify(output));`;
 const r=spawnSync(process.execPath,['-e',code],{cwd:process.cwd(),encoding:'utf8',env:{PATH:process.env.PATH,NODE_ENV:'test'}});assert.equal(r.status,0);assert.deepEqual(JSON.parse(r.stdout),['[database] DATABASE_WARNING_PRIVATE_DETAILS_WITHHELD','[database] DATABASE_ERROR_PRIVATE_DETAILS_WITHHELD']);assert.equal(r.stderr,'');
});
