const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {privateJson,reserveOutput,parseArgs,operatorSession,renderTarget,sanitizedFailure}=require('../scripts/privacyRecoveryOperator.cjs');
test('real CLI subprocess rejects private argument input without echo and never reaches a network path',()=>{
 const {spawnSync}=require('node:child_process');const secret='PRIVATE_SYNTHETIC_COMMAND_VALUE_NOT_REAL';
 const r=spawnSync(process.execPath,[path.join(__dirname,'../scripts/privacyRecoveryOperator.cjs'),'preflight','--secret',secret],{encoding:'utf8',timeout:3000});
 assert.equal(r.status,1);assert(!r.stdout.includes(secret));assert(!r.stderr.includes(secret));
 assert.deepEqual(JSON.parse(r.stderr),{check:'SPEEDY_PRIVACY_OPERATOR',result:'OPERATOR_USAGE'});
});
test('CI build record rejects a changed compiled artifact and validates the exact reviewed source again after restoration',{
 skip:process.env.CI!=='true'
},()=>{
 const {recordOperatorBuild,verifyOperatorBuild}=require('../scripts/privacyRecoveryOperatorBuild.cjs');
 const artifact=path.join(__dirname,'../dist/services/privacyRecoveryOperator.js'),record=path.join(__dirname,'../dist/privacy-operator-build.json');
 const original=fs.readFileSync(artifact),prior=fs.existsSync(record)?fs.readFileSync(record):null;
 try{const revision=recordOperatorBuild();assert.equal(verifyOperatorBuild(),revision);
  fs.appendFileSync(artifact,'\n// synthetic stale-artifact test\n');assert.throws(()=>verifyOperatorBuild(),/REVIEWED_BUILD_REQUIRED/);
  fs.writeFileSync(artifact,original);assert.equal(verifyOperatorBuild(),revision);
 }finally{fs.writeFileSync(artifact,original);if(prior)fs.writeFileSync(record,prior);else if(fs.existsSync(record))fs.unlinkSync(record);}
});
test('private files require owner-only regular files; output is exclusive, outside repo and removed on interruption',()=>{
 const dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'speedy-operator-fixture-'));fs.chmodSync(dir,0o700);
 try{const p=path.join(dir,'private.json');fs.writeFileSync(p,'{"synthetic":true}',{mode:0o600});assert.deepEqual(privateJson(p),{synthetic:true});
 fs.chmodSync(p,0o644);assert.throws(()=>privateJson(p),/PRIVATE_FILE/);fs.chmodSync(p,0o600);
 const link=path.join(dir,'link.json');fs.symlinkSync(p,link);assert.throws(()=>privateJson(link));
 assert.throws(()=>reserveOutput(p));const out=path.join(dir,'plan.json');const reserved=reserveOutput(out);assert.equal(fs.statSync(out).mode&0o777,0o600);reserved.close();assert(!fs.existsSync(out));
 const saved=reserveOutput(out);saved.save({plan:'synthetic'});saved.close();assert.deepEqual(privateJson(out),{plan:'synthetic'});assert.throws(()=>reserveOutput(out));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('CLI refuses secrets/unknown args and requires separate explicit authorization/plan for all writes',()=>{
 for(const args of [['enroll','--approval','a','--out','b'],['preflight','--password','private'],['apply','--approval','a','--out','b','--authorize'],['reset']])assert.throws(()=>parseArgs(args),/USAGE/);
 assert.equal(parseArgs(['enroll','--approval','a','--plan','p','--out','o','--authorize']).action,'enroll');
 assert.equal(sanitizedFailure(Error('PRIVATE_API_KEY')),'OPERATOR_STOP_PRIVATE_DETAILS_WITHHELD');assert.equal(sanitizedFailure({code:'AccessDenied PRIVATE_TOKEN'}),'OPERATOR_STOP_PRIVATE_DETAILS_WITHHELD');
});
test('temporary operator session keeps credential JSON inside pipe/memory, strips inherited AWS values and never adds them to arguments',()=>{
 const now=Date.now(),calls=[],secret='PRIVATE_SYNTHETIC_SECRET',id='PRIVATE_SYNTHETIC_KEY_ID',token='PRIVATE_SYNTHETIC_TOKEN';
 const result=operatorSession('existing-profile',(exe,args,options)=>{
  calls.push({exe,args,options});assert.equal(exe,'aws');assert.equal(options.stdio.join(','),'ignore,pipe,pipe');assert.equal(options.timeout,15000);
  if(args[0]==='configure'){assert(!options.env.AWS_ACCESS_KEY_ID);return JSON.stringify({AccessKeyId:id,SecretAccessKey:secret,SessionToken:token,Expiration:new Date(now+300000).toISOString()});}
  assert.equal(options.env.AWS_SECRET_ACCESS_KEY,secret);assert.equal(options.env.AWS_MAX_ATTEMPTS,'1');return JSON.stringify({Account:'080413009273',Arn:'synthetic-principal'});
 },now);
 assert.equal(calls.length,2);assert.equal(result.identity.Account,'080413009273');assert(!JSON.stringify(calls.map(c=>c.args)).includes(secret));assert(!JSON.stringify(calls.map(c=>c.args)).includes(id));
 assert.throws(()=>operatorSession('existing-profile',()=>{throw Error(secret);},now),/SESSION_UNAVAILABLE/);
 assert.throws(()=>operatorSession('existing-profile',()=>JSON.stringify({AccessKeyId:id,SecretAccessKey:secret}),now),/TEMPORARY_SESSION_REQUIRED/);
});
test('Render identity uses only bounded authenticated GETs and compares exact provider connection without printing it',async()=>{
 const a={workspaceId:'tea-synthetic',resourceId:'dpg-synthetic',databaseName:'synthetic_db',databaseUser:'synthetic_user'};
 const url='postgresql://synthetic_user:PRIVATE_DB_PASSWORD@synthetic.example.invalid/synthetic_db?sslmode=require',calls=[];
 const mock=async(target,options)=>{calls.push({target,options});assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return{ok:true,text:async()=>JSON.stringify(target.includes('?ownerId=')?[{postgres:{id:a.resourceId}}]:target.endsWith('/connection-info')?{externalConnectionString:url}:{id:a.resourceId,region:'ohio',status:'available',databaseName:a.databaseName,databaseUser:a.databaseUser})};};
 const r=await renderTarget(a,'PRIVATE_RENDER_TOKEN',url,mock);assert.equal(r.resourceId,a.resourceId);assert.equal(calls.length,3);assert(!calls.some(c=>c.target.includes('PRIVATE')));assert(!JSON.stringify(r).includes('PRIVATE'));
 await assert.rejects(renderTarget(a,'PRIVATE_RENDER_TOKEN',url.replace('PRIVATE_DB_PASSWORD','wrong'),mock),/TARGET_REJECTED/);
 await assert.rejects(renderTarget(a,'PRIVATE_RENDER_TOKEN',url,async()=>{throw Error('PRIVATE_RENDER_TOKEN');}),/IDENTITY_UNAVAILABLE/);
});
