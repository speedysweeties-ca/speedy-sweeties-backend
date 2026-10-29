// Explicit offline entry point ONLY. Never imported by app/server/jobs/routes.
// Secrets are hidden terminal input or existing short-lived AWS profile credentials;
// no secret accepts an argument, appears in stdout/errors, or is written to disk.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { askHidden } = require('../tests/privacyIsolatedClient.cjs');
const gates = ['PRIVACY_DELETION_ENABLED','PRIVACY_FULFILLMENT_ENABLED','PRIVACY_VERIFICATION_EMAIL_ENABLED','PRIVACY_VERIFICATION_PHONE_ENABLED'];
const fail = code => { const e = new Error(code); e.operatorCode = code; throw e; };
function privateJson(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.uid !== process.getuid() || (st.mode & 0o077) || st.size > 32768) fail('OPERATOR_PRIVATE_FILE_REQUIRED');
    return JSON.parse(fs.readFileSync(fd, 'utf8'));
  } finally { fs.closeSync(fd); }
}
function reserveOutput(file, root = process.cwd()) {
  if (!path.isAbsolute(file) || file === root || file.startsWith(root + path.sep)) fail('OPERATOR_EXTERNAL_OUTPUT_REQUIRED');
  const parent = fs.lstatSync(path.dirname(file));
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid() || (parent.mode & 0o077) ||
      fs.realpathSync(path.dirname(file)) !== path.dirname(file)) fail('OPERATOR_PRIVATE_DIRECTORY_REQUIRED');
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  let closed = false;
  return {
    save(value) { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); fs.closeSync(fd); closed = true; },
    close() { if (!closed) { fs.closeSync(fd); closed = true; fs.unlinkSync(file); } }
  };
}
function parseArgs(argv) {
  const action = argv[0], flags = {};
  if (!['preflight','enroll','dry-run','apply','resolve'].includes(action)) fail('OPERATOR_USAGE');
  for (let i=1;i<argv.length;i++) {
    const key = argv[i];
    if (key === '--authorize' && !flags[key]) flags[key] = true;
    else if (['--approval','--plan','--out'].includes(key) && !flags[key] && argv[i+1] && !argv[i+1].startsWith('--')) flags[key] = argv[++i];
    else fail('OPERATOR_USAGE');
  }
  if (!flags['--approval'] || !flags['--out'] || (['enroll','apply','resolve'].includes(action) && (!flags['--authorize'] || !flags['--plan']))) fail('OPERATOR_USAGE');
  return { action, flags };
}
function cleanAwsEnvironment() {
  const e = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AWS_')));
  return { ...e, AWS_MAX_ATTEMPTS:'1', AWS_PAGER:'', AWS_CLI_AUTO_PROMPT:'off', AWS_IGNORE_CONFIGURED_ENDPOINT_URLS:'true' };
}
function awsJson(args, env, execute = execFileSync) {
  try {
    return JSON.parse(execute('aws', args, { env, encoding:'utf8', stdio:['ignore','pipe','pipe'], timeout:15000, maxBuffer:65536 }));
  } catch { fail('OPERATOR_AWS_SESSION_UNAVAILABLE'); }
}
function operatorSession(profile, execute = execFileSync, now = Date.now()) {
  const e = cleanAwsEnvironment();
  const c = awsJson(['configure','export-credentials','--profile',profile,'--format','process','--no-cli-pager'], e, execute);
  const expires = Date.parse(c.Expiration);
  if (!c.AccessKeyId || !c.SecretAccessKey || !c.SessionToken || !Number.isFinite(expires) || expires <= now + 60000 || expires > now + 12*60*60*1000)
    fail('OPERATOR_TEMPORARY_SESSION_REQUIRED');
  const credentials = { accessKeyId:c.AccessKeyId, secretAccessKey:c.SecretAccessKey, sessionToken:c.SessionToken, expiration:new Date(expires) };
  const identity = awsJson(['sts','get-caller-identity','--region','ca-central-1','--endpoint-url','https://sts.ca-central-1.amazonaws.com',
    '--output','json','--no-cli-pager','--cli-connect-timeout','3','--cli-read-timeout','5'],
    { ...e, AWS_ACCESS_KEY_ID:c.AccessKeyId, AWS_SECRET_ACCESS_KEY:c.SecretAccessKey, AWS_SESSION_TOKEN:c.SessionToken }, execute);
  return { credentials, identity };
}
async function renderTarget(a, token, databaseUrl, fetchImpl = fetch) {
  async function get(route) {
    let r;
    try { r = await fetchImpl('https://api.render.com/v1/' + route, { method:'GET', redirect:'error',
      headers:{authorization:`Bearer ${token}`,accept:'application/json'}, signal:AbortSignal.timeout(8000) });
      if (!r.ok) fail('OPERATOR_RENDER_IDENTITY_UNAVAILABLE');
      const text = await r.text(); if (text.length > 2*1024*1024) fail('OPERATOR_RENDER_IDENTITY_UNAVAILABLE');
      return JSON.parse(text);
    } catch { fail('OPERATOR_RENDER_IDENTITY_UNAVAILABLE'); }
  }
  let cursor, found = false;
  for (let page=0;page<20;page++) {
    const rows = await get(`postgres?ownerId=${a.workspaceId}&limit=100${cursor?'&cursor='+encodeURIComponent(cursor):''}`);
    if (!Array.isArray(rows)) fail('OPERATOR_RENDER_IDENTITY_UNAVAILABLE');
    if (rows.some(r=>r.postgres?.id===a.resourceId)) { found=true; break; }
    if (rows.length < 100) break;
    const next = rows.at(-1)?.cursor; if (!next || next===cursor) fail('OPERATOR_RENDER_IDENTITY_UNAVAILABLE');cursor=next;
  }
  if (!found) fail('OPERATOR_TARGET_REJECTED');
  const metadata = await get(`postgres/${a.resourceId}`);
  // Provider read-back binds the hidden URL to the exact resource, not just name.
  // Connection info remains memory-only and is NEVER printed or persisted.
  const connection = await get(`postgres/${a.resourceId}/connection-info`);
  let url, observed;
  try { url=new URL(databaseUrl); observed=new URL(connection.externalConnectionString); }
  catch { fail('OPERATOR_TARGET_REJECTED'); }
  if (metadata.id!==a.resourceId || url.hostname!==observed.hostname || url.pathname!==observed.pathname ||
      url.username!==observed.username || url.password!==observed.password || (url.port||'5432')!==(observed.port||'5432') ||
      metadata.region!=='ohio' || metadata.status!=='available') fail('OPERATOR_TARGET_REJECTED');
  return { workspaceId:a.workspaceId,resourceId:metadata.id,hostname:observed.hostname,
    databaseName:metadata.databaseName,databaseUser:metadata.databaseUser,status:metadata.status };
}
async function versionInventory(client, a) {
  const { ListObjectVersionsCommand } = require('@aws-sdk/client-s3');
  let keyMarker, versionMarker;const rows=[],seen=new Set();
  for (let page=0;page<25;page++) {
    let p;try {p=await client.send(new ListObjectVersionsCommand({Bucket:a.bucket,ExpectedBucketOwner:a.ownerAccountId,Prefix:a.prefix,
      MaxKeys:1000,KeyMarker:keyMarker,VersionIdMarker:versionMarker}),{abortSignal:AbortSignal.timeout(4000)});}catch{fail('OPERATOR_VERSION_INVENTORY_UNAVAILABLE');}
    for (const v of p.Versions||[]) rows.push({key:v.Key,latest:v.IsLatest===true,marker:false});
    for (const v of p.DeleteMarkers||[]) rows.push({key:v.Key,latest:v.IsLatest===true,marker:true});
    if (typeof p.IsTruncated!=='boolean' || rows.length>20000) fail('OPERATOR_VERSION_INVENTORY_UNAVAILABLE');
    if (!p.IsTruncated)return rows;
    keyMarker=p.NextKeyMarker;versionMarker=p.NextVersionIdMarker;const marker=JSON.stringify([keyMarker,versionMarker]);
    if(!keyMarker||!versionMarker||seen.has(marker))fail('OPERATOR_VERSION_INVENTORY_UNAVAILABLE');seen.add(marker);
  }
  fail('OPERATOR_VERSION_INVENTORY_UNAVAILABLE');
}
function sanitizedFailure(error) {
  const code = error?.operatorCode || error?.code;
  return typeof code==='string' && /^(?:OPERATOR|RECOVERY)_[A-Z_]{1,80}$/.test(code) ? code : 'OPERATOR_STOP_PRIVATE_DETAILS_WITHHELD';
}
async function main(argv = process.argv.slice(2)) {
  const {action,flags}=parseArgs(argv);
  if(process.version!=='v'+require('../package.json').engines.node)fail('OPERATOR_PINNED_RUNTIME_REQUIRED');
  if(!process.stdin.isTTY||!process.stdout.isTTY||fs.existsSync('.env'))fail('OPERATOR_PRIVATE_TERMINAL_REQUIRED');
  if(['DEBUG','NODE_DEBUG','NODE_OPTIONS','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR','NODE_TLS_REJECT_UNAUTHORIZED',
    'AWS_CA_BUNDLE','PRISMA_QUERY_ENGINE_LOG_LEVEL','RUST_LOG'].some(k=>process.env[k]))fail('OPERATOR_UNSAFE_RUNTIME_OVERRIDE');
  if(gates.some(k=>process.env[k]!==undefined&&process.env[k]!=='false'))fail('OPERATOR_GATES_MUST_BE_FALSE');
  const revision=require('./privacyRecoveryOperatorBuild.cjs').verifyOperatorBuild();
  const approval=privateJson(flags['--approval']),plan=flags['--plan']?privateJson(flags['--plan']):undefined;
  const output=reserveOutput(flags['--out']);let db,client;
  try {
    const databaseUrl=await askHidden('Approved database external URL (hidden): ');
    const digestKey=await askHidden('Existing stable PRIVACY_DIGEST_KEY (hidden): ');
    // Suppress dotenv, not target guards. Only pure modules + a log-free direct
    // Prisma client are loaded. No server/app/background/delivery startup import.
    process.env.NODE_ENV='test';process.env.DATABASE_URL=databaseUrl;process.env.JWT_SECRET='offline-operator-unused-authentication';
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON='{}';for(const k of gates)process.env[k]='false';
    const {validateOperatorApproval,runPrivacyOperator}=require('../dist/services/privacyRecoveryOperator');
    const a=validateOperatorApproval(approval,databaseUrl,revision);
    const token=await askHidden('Existing Render read-only API credential (hidden): ');
    const target=await renderTarget(a,token,databaseUrl);
    const session=operatorSession(a.awsProfile);
    const {createRecoveryS3Client,S3ProtectedDecisionStore}=require('../dist/services/privacyRecoveryS3');
    const {PrivacyRecoveryJournal}=require('../dist/services/privacyRecoveryJournal');
    const {PrivacyDeletionService,ADOPTED_COMPLETION_TIMEFRAME}=require('../dist/services/privacyDeletion.service');
    client=createRecoveryS3Client(session.credentials);
    const store=new S3ProtectedDecisionStore({bucket:a.bucket,ownerAccountId:a.ownerAccountId,prefix:a.prefix,scope:a.scope,
      mode:a.operation==='enrollment'?'enrollment':'active',...(a.enrollmentHash?{genesisHash:a.enrollmentHash}:{})},client);
    const journal=new PrivacyRecoveryJournal(store,a.scope,digestKey);
    const {PrismaClient}=require('@prisma/client');db=new PrismaClient({datasources:{db:{url:databaseUrl}},log:[]});
    const delivery={async start(){fail('OPERATOR_DELIVERY_FORBIDDEN');},async check(){fail('OPERATOR_DELIVERY_FORBIDDEN');}};
    const service=new PrivacyDeletionService(db,digestKey,delivery,()=>false,ADOPTED_COMPLETION_TIMEFRAME,'12-31',journal);
    const result=await runPrivacyOperator(a,action,{db,journal,service,databaseUrl,digestKey,sourceRevision:revision,
      verifyTarget:async()=>target,identity:async()=>session.identity,versions:()=>versionInventory(client,a)},plan,flags['--authorize']===true);
    try{output.save(result.plan||result);}catch{fail('OPERATOR_OUTPUT_UNCERTAIN_INSPECT_BEFORE_RETRY');}
    console.log(JSON.stringify({check:'SPEEDY_PRIVACY_OPERATOR',result:result.result,planSaved:!!result.plan,
      pinRecordSaved:!!result.pins,trafficMayReopen:false,...(result.outcome?{outcome:result.outcome}:{})}));
  } finally { if(db)await db.$disconnect().catch(()=>{});if(client)client.destroy();output.close(); }
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({check:'SPEEDY_PRIVACY_OPERATOR',result:sanitizedFailure(e)}));process.exitCode=1;});
module.exports={privateJson,reserveOutput,parseArgs,awsJson,operatorSession,renderTarget,versionInventory,sanitizedFailure,main};
