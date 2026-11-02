// Explicit offline operator build record; NOT a production startup/build hook.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),recordPath=path.join(root,'dist/privacy-operator-build.json');
const paths=['src','scripts','prisma','package.json','package-lock.json','tsconfig.json','.node-version',
 'tests/privacyIsolatedClient.cjs','tests/privacyIsolatedContract.cjs'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stop=()=>{const e=new Error('OPERATOR_REVIEWED_BUILD_REQUIRED');e.operatorCode='OPERATOR_REVIEWED_BUILD_REQUIRED';throw e;};
function git(...args){return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:3000}).trim();}
function snapshot(){
 if(process.version!=='v'+require('../package.json').engines.node||fs.realpathSync(process.cwd())!==root)stop();
 if(git('diff','--name-only','HEAD','--',...paths)||git('ls-files','--others','--exclude-standard','--','src','scripts','prisma'))stop();
 const files=git('ls-files','--',...paths).split('\n').filter(Boolean);
 const sourceDigest=sha(JSON.stringify(files.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))])));
 const dist={};
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  const p=path.join(dir,entry.name);if(entry.isSymbolicLink())stop();if(entry.isDirectory())walk(p);
  else if(p.endsWith('.js'))dist[path.relative(root,p)]=sha(fs.readFileSync(p));
 }}
 walk(path.join(root,'dist'));if(!Object.keys(dist).length)stop();
 return{format:1,sourceRevision:git('rev-parse','HEAD'),sourceDigest,dist};
}
function verifyOperatorBuild(){
 try{const current=snapshot(),saved=JSON.parse(fs.readFileSync(recordPath,'utf8'));
  if(JSON.stringify(current)!==JSON.stringify(saved))stop();return current.sourceRevision;
 }catch{stop();}
}
function recordOperatorBuild(){const record=snapshot();fs.writeFileSync(recordPath,JSON.stringify(record),{mode:0o600});return record.sourceRevision;}
if(require.main===module){try{recordOperatorBuild();console.log('OPERATOR_BUILD_RECORDED');}catch{console.error('OPERATOR_REVIEWED_BUILD_REQUIRED');process.exitCode=1;}}
module.exports={verifyOperatorBuild,recordOperatorBuild};
