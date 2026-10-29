const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
test('CloudShell inventory and cleanup guards pass synthetic metadata/permission/redaction cases without AWS calls', () => {
  const code = String.raw`
import importlib.util, json, pathlib
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
m = load('inventory', 'scripts/privacyAwsReadOnly.py')
c = load('cleanup', 'scripts/privacyS3SyntheticCleanup.py')
docs = {k: json.loads(pathlib.Path('docs/privacy-s3-' + k + '-policy.json').read_text()) for k in ['bucket','application','operator']}
for name, doc in docs.items(): assert m.policy_hash(doc) == m.POLICY_HASHES[name]
calls = []; mode = 'pass'
def run(service, operation, parameters):
    calls.append((service, operation, parameters))
    if operation == 'get-caller-identity': return {'Account': '999999999999' if mode == 'wrong' else m.ACCOUNT, 'Arn': 'arn:aws:iam::'+m.ACCOUNT+':user/SyntheticOperator'}
    if mode == 'denied': raise m.Unverified('AccessDenied')
    if operation == 'get-bucket-location': return {'LocationConstraint':'ca-central-1'}
    if operation == 'get-bucket-versioning': return {'Status':'Enabled'}
    if operation == 'get-public-access-block': return {'PublicAccessBlockConfiguration': {k:True for k in ['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets']}}
    if operation == 'get-bucket-policy-status': return {'PolicyStatus': {'IsPublic':False}}
    if operation == 'get-bucket-encryption': return {} if mode == 'missingEncryption' else {'ServerSideEncryptionConfiguration': {'Rules':[{'ApplyServerSideEncryptionByDefault':{'SSEAlgorithm':'AES256'}}]}}
    if operation == 'get-bucket-ownership-controls': return {'OwnershipControls':{'Rules':[{'ObjectOwnership':'BucketOwnerEnforced'}]}}
    absent = {'get-object-lock-configuration':'ObjectLockConfigurationNotFoundError','get-bucket-lifecycle-configuration':'NoSuchLifecycleConfiguration','get-bucket-replication':'ReplicationConfigurationNotFoundError','get-login-profile':'NoSuchEntity'}
    if operation in absent:
        if mode == 'lifecycle' and operation == 'get-bucket-lifecycle-configuration': return {'Rules':[{'Status':'Enabled'}]}
        raise m.Unverified(absent[operation])
    if operation == 'get-bucket-policy': return {'Policy':json.dumps(docs['bucket'])}
    if operation == 'get-user': return {'User': {'Arn':'arn:aws:iam::'+m.ACCOUNT+':user/'+m.USER}}
    if operation == 'list-attached-user-policies': return {'AttachedPolicies':[{'PolicyArn':'arn:aws:iam::'+m.ACCOUNT+':policy/SpeedyPrivacyJournalApplicationPolicy'}]}
    if operation == 'list-user-policies': return {'PolicyNames':['UNREVIEWED'] if mode == 'extraPolicy' else []}
    if operation == 'list-groups-for-user': return {'Groups':[]}
    if operation == 'get-policy': return {'Policy':{'DefaultVersionId':'v1','AttachmentCount':0 if 'Operator' in parameters['PolicyArn'] else 1}}
    if operation == 'get-policy-version': return {'PolicyVersion':{'Document':docs['operator' if 'Operator' in parameters['PolicyArn'] else 'application']}}
    if operation == 'list-access-keys': return {'AccessKeyMetadata':[{'AccessKeyId':'SYNTHETIC_IDENTIFIER_MUST_NOT_ESCAPE','Status':'Active','CreateDate':'2026-10-28T00:00:00Z'}]}
    if operation == 'get-access-key-last-used': return {'AccessKeyLastUsed':{}}
    raise AssertionError('Unexpected operation')
out = m.check(run); assert out['result'] == 'READBACK_PASS_LIVE_APPLICATION_ACCESS_UNVERIFIED'
assert out['applicationCredentialsVerified'] is False and out['writes']==0 and out['objectsRead']==0
assert 'SYNTHETIC_IDENTIFIER_MUST_NOT_ESCAPE' not in json.dumps(out)
mode='wrong'; calls.clear(); assert m.check(run)['result']=='STOP_ACCOUNT_MISMATCH' and len(calls)==1
for mode, check in [('denied','versioningEnabled'),('missingEncryption','sseS3'),('lifecycle','noLifecycleRules'),('extraPolicy','noInlinePolicies')]:
    out=m.check(run); assert out['result']=='REVIEW_REQUIRED' and out['checks'][check] is not True
try: m.cli('s3api','delete-object',{}); raise AssertionError('Mutation allowed')
except m.Unverified: pass
def forbidden(*args): raise AssertionError('Unauthorized cleanup called AWS')
assert c.cleanup(None, forbidden)['deletedVersions']==0
mode='pass'; deleted=[]; version={'Key':c.PREFIX+'journal/0000000000000001.json','VersionId':'synthetic-version'}
def cleanup_run(service, operation, parameters):
    if operation=='get-caller-identity': return {'Account':c.ACCOUNT,'Arn':'synthetic-operator'}
    if operation=='list-object-versions': return {'Versions':[] if deleted else [version], 'DeleteMarkers':[]}
    assert operation=='delete-object' and parameters['Key'].startswith(c.PREFIX); deleted.append(parameters); return {}
assert c.cleanup(c.RUN_ID, cleanup_run)['emptyVersionInventory'] is True and len(deleted)==1
def wrong_inventory(service, operation, parameters):
    return {'Account':c.ACCOUNT,'Arn':'operator'} if operation=='get-caller-identity' else {'Versions':[{'Key':'production/epoch-0001/0000000000000001.json','VersionId':'synthetic'}]}
assert c.cleanup(c.RUN_ID, wrong_inventory)['result']=='STOP_UNEXPECTED_SYNTHETIC_INVENTORY'
print(json.dumps({'check':'AWS_METADATA_AND_CLEANUP_SYNTHETIC','passed':12,'cloudCalls':0}))
`;
  const output = execFileSync('python3', ['-B', '-c', code], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const result = JSON.parse(output); assert.equal(result.passed, 12); assert.equal(result.cloudCalls, 0);
});
test('CLI subprocess boundary preserves private input files and bounded, redacted identity diagnostics', () => {
  const code = String.raw`
import importlib.util, json, pathlib, stat, subprocess, sys
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('inventory','scripts/privacyAwsReadOnly.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
secret='SYNTHETIC_PRIVATE_IDENTIFIER_NOT_FOR_OUTPUT'
def result(status=0, stdout=None, stderr=''):
    return subprocess.CompletedProcess([], status, json.dumps({'Account':m.ACCOUNT}) if stdout is None else stdout, stderr)
with patch.object(m.subprocess,'run',return_value=result()) as p:
    assert m.cli('sts','get-caller-identity',{})['Account']==m.ACCOUNT
    args,kw=p.call_args; assert args[0][:3]==['aws','sts','get-caller-identity']
    assert '--cli-input-json' not in args[0] and kw['stdin']==subprocess.DEVNULL and 'input' not in kw
    assert kw['timeout']==25 and kw['capture_output'] is True and kw['check'] is False
    assert kw['env']['AWS_MAX_ATTEMPTS']=='1' and kw['env']['AWS_PAGER']==''
paths=[]
def inspect_input(command,**kw):
    path=pathlib.Path(command[command.index('--cli-input-json')+1][7:]); paths.append(path)
    assert stat.S_IMODE(path.stat().st_mode)==0o600 and stat.S_IMODE(path.parent.stat().st_mode)==0o700
    assert json.loads(path.read_text())=={'AccessKeyId':secret}
    return result(stdout='{}')
with patch.object(m.subprocess,'run',side_effect=inspect_input) as p:
    m.cli('iam','get-access-key-last-used',{'AccessKeyId':secret})
    args,kw=p.call_args; assert secret not in json.dumps(args)
    assert args[0][-2]=='--cli-input-json' and args[0][-1].startswith('file://')
    assert '/dev/stdin' not in args[0][-1] and kw['stdin']==subprocess.DEVNULL and 'input' not in kw
assert all(not p.exists() and not p.parent.exists() for p in paths)
cases=[(252,'Unknown options: '+secret,'CLI_SYNTAX_OR_INPUT','CLI_FAILED'),
       (2,'Unknown argument '+secret,'CLI_SYNTAX_OR_INPUT','CLI_FAILED'),
       (253,'Unable to locate credentials '+secret,'CLI_ENVIRONMENT_OR_CONFIGURATION','CLI_FAILED'),
       (254,'An error occurred (AccessDenied) when calling operation '+secret,'SERVICE_ERROR','AccessDenied'),
       (255,'Unable to load paramfile '+secret,'CLI_INPUT_JSON_OR_FILE','CLI_FAILED'),
       (255,'Invalid JSON received '+secret,'CLI_INPUT_JSON_OR_FILE','CLI_FAILED'),
       (255,'Read timeout on endpoint URL '+secret,'NETWORK_TIMEOUT','CLI_FAILED'),
       (255,'Could not connect to the endpoint URL '+secret,'NETWORK_OR_TLS','CLI_FAILED'),
       (255,'SSL validation failed '+secret,'NETWORK_OR_TLS','CLI_FAILED'),
       (255,'An error occurred ('+secret+') when calling operation','CLI_ERROR','CLI_FAILED'),
       (130,'Interrupted '+secret,'INTERRUPTED','CLI_FAILED')]
for status,stderr,category,provider in cases:
    with patch.object(m.subprocess,'run',return_value=result(status,stderr=stderr)):
        try: m.cli('sts','get-caller-identity',{}); raise AssertionError('Failure accepted')
        except m.Unverified as error:
            d=error.diagnostic(); assert d=={'category':category,'exitCode':status,'code':provider}
            assert secret not in json.dumps(d)
for stdout,category in [('not-json '+secret,'INVALID_JSON_OUTPUT'),('[]','INVALID_RESPONSE_SHAPE'),('','INVALID_JSON_OUTPUT')]:
    with patch.object(m.subprocess,'run',return_value=result(stdout=stdout)):
        try: m.cli('sts','get-caller-identity',{}); raise AssertionError('Malformed success accepted')
        except m.Unverified as error: assert error.category==category and error.exit_code==0
for problem,category in [(FileNotFoundError(secret),'EXECUTABLE_NOT_FOUND'),(OSError(secret),'PROCESS_START_ERROR'),
                         (subprocess.TimeoutExpired(secret,25,output=secret,stderr=secret),'PROCESS_TIMEOUT')]:
    with patch.object(m.subprocess,'run',side_effect=problem):
        out=m.check(); assert out['result']=='STOP_ACCOUNT_UNVERIFIED'
        assert out['identityCheck']['category']==category and out['identityCheck']['exitCode'] is None
        assert secret not in json.dumps(out)
for invalid in [{},{'Account':80413009273},{'Account':'wrong'}]:
    calls=[]
    def invalid_run(*args): calls.append(args); return invalid
    out=m.check(invalid_run); assert out['identityCheck']['code']=='CLI_INVALID_IDENTITY' and len(calls)==1
    assert out['result']=='STOP_ACCOUNT_UNVERIFIED'
# Both parameterless identity forms succeed; no legacy stdin probe remains.
def successful_run(command,**kw):
    assert command[:3]==['aws','sts','get-caller-identity']
    assert '--cli-input-json' not in command and 'input' not in kw
    if '--query' in command:
        assert command==['aws','sts','get-caller-identity','--query','Account','--output','text','--region','ca-central-1','--no-cli-pager']
        return result(stdout=m.ACCOUNT+'\n')
    return result()
with patch.object(m.subprocess,'run',side_effect=successful_run) as p:
    with patch.object(m,'identity_comparison',wraps=m.identity_comparison) as comparison:
        # Inventory behavior is covered by the first test; stop it safely after STS here.
        def only_identity(service,op,params):
            if service=='sts': return m.cli(service,op,params)
            raise m.Unverified('AccessDenied','SERVICE_ERROR',254)
        out=m.check(only_identity,diagnose_identity=True)
        assert p.call_count==2 and comparison.call_count==1 and out['result']=='REVIEW_REQUIRED'
        assert out['identityComparison']['directAccountText']['accountMatches'] is True
        assert 'legacyStdinJson' not in out['identityComparison']
        assert out['diagnostics']['regionMatches']['exitCode']==254 and secret not in json.dumps(out)
# No inventory fallback: a successful direct check cannot rescue a failed primary.
def primary_failed(command,**kw):
    if '--query' in command: return result(stdout=m.ACCOUNT)
    assert '--cli-input-json' not in command
    return result(252,stderr='Unknown option '+secret)
with patch.object(m.subprocess,'run',side_effect=primary_failed) as p:
    out=m.check(diagnose_identity=True); assert p.call_count==2 and out['result']=='STOP_ACCOUNT_UNVERIFIED'
    assert 'checks' not in out and out['identityCheck']['exitCode']==252
    assert secret not in json.dumps(out)
# Wrong primary account stops before diagnostic probes or any bucket/IAM request.
with patch.object(m.subprocess,'run',return_value=result(stdout=json.dumps({'Account':'999999999999'}))) as p:
    out=m.check(diagnose_identity=True); assert p.call_count==1 and out['result']=='STOP_ACCOUNT_MISMATCH'
# Wrong comparison account also stops inventory.
with patch.object(m.subprocess,'run',side_effect=[result(),result(stdout='999999999999')]) as p:
    out=m.check(diagnose_identity=True); assert p.call_count==2 and out['result']=='STOP_ACCOUNT_MISMATCH'
    assert 'checks' not in out
print(json.dumps({'check':'AWS_CLI_BOUNDARY_SYNTHETIC','passed':True,'cloudCalls':0}))
`;
  const output = execFileSync('python3', ['-B', '-c', code], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  assert.deepEqual(JSON.parse(output), { check: 'AWS_CLI_BOUNDARY_SYNTHETIC', passed: true, cloudCalls: 0 });
});
test('real CLI child reads closed 0600 JSON files and cleanup/redaction survive every exit path', () => {
  const code = String.raw`
import hashlib, importlib.util, json, os, pathlib, subprocess, sys
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('inventory','scripts/privacyAwsReadOnly.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
secret='SYNTHETIC_PRIVATE_IDENTIFIER_'+('x'*65536)+'_\u2603'
parameters={'AccessKeyId':secret}
expected=hashlib.sha256(json.dumps(parameters).encode('utf-8')).hexdigest()
real_run=subprocess.run; real_file=m.tempfile.NamedTemporaryFile; files=[]; paths=[]; mode='success'; children=0
child=r'''
import hashlib,json,os,pathlib,stat,sys,time
mode=sys.argv[1]
url=sys.argv[sys.argv.index('--cli-input-json')+1]
assert url.startswith('file://') and '/dev/stdin' not in url
path=pathlib.Path(url[7:]); raw=path.read_bytes(); value=json.loads(raw)
assert stat.S_IMODE(path.stat().st_mode)==0o600 and path.stat().st_uid==os.geteuid()
assert stat.S_IMODE(path.parent.stat().st_mode)==0o700 and path.parent.stat().st_uid==os.geteuid()
assert hashlib.sha256(raw).hexdigest()==os.environ['SPEEDY_FIXTURE_INPUT_HASH']
assert sys.stdin.read()==''
if 'AccessKeyId' in value: assert value['AccessKeyId'] not in '\0'.join(sys.argv)
else:
    assert value=={'Bucket':'speedy-sweeties-privacy-decisions-080413009273','ExpectedBucketOwner':'080413009273'}
if mode=='success': print(json.dumps({'boundaryPass':True}))
elif mode=='error':
    sys.stderr.write('An error occurred ('+value['AccessKeyId']+') Invalid JSON '+raw.decode()); sys.exit(252)
elif mode=='malformed': print(raw.decode()+' invalid '+value['AccessKeyId'])
elif mode=='timeout':
    print(raw.decode(),flush=True); sys.stderr.write(value['AccessKeyId']); sys.stderr.flush(); time.sleep(10)
else: raise AssertionError('Unexpected fixture mode')
'''
def observe_file(*args,**kw):
    stream=real_file(*args,**kw); files.append(stream); paths.append(pathlib.Path(stream.name)); return stream
def spawn(command,**kw):
    global children
    assert command[:3] in [['aws','iam','get-access-key-last-used'],['aws','s3api','get-bucket-location']]
    assert secret not in json.dumps(command) and '--cli-input-json' in command
    assert all(f.closed for f in files)  # Parent write handles closed before spawning.
    assert kw['stdin']==subprocess.DEVNULL and 'input' not in kw and kw['timeout']==25
    if mode=='interrupt': raise KeyboardInterrupt()
    if mode=='spawn-error': return real_run([str(paths[-1].parent/'missing-executable')],**kw)
    children+=1; kw['env']=dict(kw['env'],SPEEDY_FIXTURE_INPUT_HASH=expected)
    if mode=='timeout': kw['timeout']=1  # Test-only shortening; production remains 25s.
    return real_run([sys.executable,'-c',child,mode,*command[1:]],**kw)
def removed():
    assert all(f.closed for f in files)
    assert all(not p.exists() and not p.parent.exists() for p in paths)
with patch.object(m.tempfile,'NamedTemporaryFile',side_effect=observe_file),patch.object(m.subprocess,'run',side_effect=spawn):
    for mask in [0,0o777]:
        previous=os.umask(mask)
        try: assert m.cli('iam','get-access-key-last-used',parameters)=={'boundaryPass':True}
        finally: os.umask(previous)
        removed()
    bucket_input={'Bucket':m.BUCKET,'ExpectedBucketOwner':m.ACCOUNT}
    expected=hashlib.sha256(json.dumps(bucket_input).encode('utf-8')).hexdigest()
    assert m.cli('s3api','get-bucket-location',bucket_input)=={'boundaryPass':True}; removed()
    expected=hashlib.sha256(json.dumps(parameters).encode('utf-8')).hexdigest()
    for mode,category,exit_code in [('error','CLI_INPUT_JSON_OR_FILE',252),('malformed','INVALID_JSON_OUTPUT',0),
                                    ('timeout','PROCESS_TIMEOUT',None),('spawn-error','EXECUTABLE_NOT_FOUND',None)]:
        try: m.cli('iam','get-access-key-last-used',parameters); raise AssertionError('Failure accepted')
        except m.Unverified as error:
            safe=error.diagnostic(); assert safe['category']==category and safe['exitCode']==exit_code
            assert secret not in json.dumps(safe) and str(paths[-1]) not in json.dumps(safe)
        removed()
    mode='interrupt'
    try: m.cli('iam','get-access-key-last-used',parameters); raise AssertionError('Interruption swallowed')
    except KeyboardInterrupt: pass
    removed()
    before=children
    def partial_write(value,stream):
        stream.write(secret[:40]); raise TypeError(secret)
    with patch.object(m.json,'dump',side_effect=partial_write):
        try: m.cli('iam','get-access-key-last-used',parameters); raise AssertionError('Partial input used')
        except m.Unverified as error:
            assert error.category=='PRIVATE_INPUT_PREPARATION_ERROR' and secret not in json.dumps(error.diagnostic())
    assert children==before; removed()
    mode='success'; real_unlink=m.os.unlink; first=True
    def fail_once(path,*args,**kw):
        global first
        if first: first=False; raise PermissionError(secret)
        return real_unlink(path,*args,**kw)
    with patch.object(m.os,'unlink',side_effect=fail_once):
        try: m.cli('iam','get-access-key-last-used',parameters); raise AssertionError('Cleanup failure hidden')
        except m.Unverified as error:
            assert error.category=='PRIVATE_INPUT_CLEANUP_ERROR' and secret not in json.dumps(error.diagnostic())
    removed()  # Directory cleanup removed the file; the initial error still stops the run.
calls=[]
def cleanup_stop(service,op,params):
    calls.append(op)
    if service=='sts': return {'Account':m.ACCOUNT}
    raise m.Unverified('CLI_TEMPFILE_CLEANUP_FAILED','PRIVATE_INPUT_CLEANUP_ERROR')
try: m.check(cleanup_stop); raise AssertionError('Inventory continued after cleanup failure')
except m.Unverified: assert len(calls)==2
assert children==7
print(json.dumps({'check':'AWS_PRIVATE_FILE_REAL_BOUNDARY','realChildren':children,'passed':True,'cloudCalls':0}))
`;
  const output = execFileSync('python3', ['-B', '-c', code], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  assert.deepEqual(JSON.parse(output), { check: 'AWS_PRIVATE_FILE_REAL_BOUNDARY', realChildren: 7, passed: true, cloudCalls: 0 });
});
test('standalone cleanup uses closed private files through real children and stops safely on partial failure', () => {
  const code = String.raw`
import importlib.util,json,os,pathlib,subprocess,sys,tempfile
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('cleanup','scripts/privacyS3SyntheticCleanup.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
real_run=subprocess.run;real_file=c.tempfile.NamedTemporaryFile;files=[];paths=[];calls=[];mode='success'
child=r'''
import json,os,pathlib,stat,sys,time
mode=os.environ['SPEEDY_CLEANUP_FIXTURE_MODE']; service,operation=sys.argv[1:3]
state=pathlib.Path(os.environ['SPEEDY_CLEANUP_FIXTURE_STATE'])
account='080413009273';bucket='speedy-sweeties-privacy-decisions-080413009273'
prefix='verification/recovery-integration-20261028/'
assert sys.stdin.read()==''
if operation=='get-caller-identity':
    assert '--cli-input-json' not in sys.argv
    print(json.dumps({'Account':'999999999999' if mode=='wrong-account' else account,
                     'Arn':'arn:aws:iam::'+account+':user/'+('SpeedyPrivacyJournalApplication' if mode=='app-identity' else 'SyntheticOperator')}));sys.exit(0)
url=sys.argv[sys.argv.index('--cli-input-json')+1];assert url.startswith('file://') and '/dev/stdin' not in url
path=pathlib.Path(url[7:]);params=json.loads(path.read_text())
assert stat.S_IMODE(path.stat().st_mode)==0o600 and stat.S_IMODE(path.parent.stat().st_mode)==0o700
assert path.stat().st_uid==os.geteuid() and path.parent.stat().st_uid==os.geteuid()
assert params['Bucket']==bucket and params['ExpectedBucketOwner']==account
assert 'synthetic-private-version' not in '\0'.join(sys.argv)
if mode=='error': sys.stderr.write('SYNTHETIC_PRIVATE_RESPONSE');sys.exit(252)
if mode=='malformed': print('SYNTHETIC_PRIVATE_RESPONSE');sys.exit(0)
if mode=='timeout': print('SYNTHETIC_PRIVATE_RESPONSE',flush=True);time.sleep(10)
deleted=int(state.read_text())
if operation=='list-object-versions':
    assert params['Prefix']==prefix
    key=('production/epoch-0001/' if mode=='unknown' else prefix+'journal/')+'0000000000000001.json'
    print(json.dumps({'Versions':[] if deleted==2 else [{'Key':key,'VersionId':'synthetic-private-version'}],
                     'DeleteMarkers':[] if deleted==2 else [{'Key':key,'VersionId':'synthetic-marker'}]}))
elif operation=='delete-object':
    assert params['Key']==prefix+'journal/0000000000000001.json' and params['VersionId'] in ['synthetic-private-version','synthetic-marker']
    if mode=='fail-second-delete' and deleted==1: sys.stderr.write('SYNTHETIC_PRIVATE_RESPONSE');sys.exit(254)
    state.write_text(str(deleted+1));print('{}')
else: raise AssertionError('Unexpected operation')
'''
def observe_file(*args,**kw):
    f=real_file(*args,**kw);files.append(f);paths.append(pathlib.Path(f.name));return f
def spawn(command,**kw):
    assert command[0]=='aws' and command[1:3] in [['sts','get-caller-identity'],['s3api','list-object-versions'],['s3api','delete-object']]
    assert all(f.closed for f in files) and kw['stdin']==subprocess.DEVNULL and 'input' not in kw and kw['timeout']==25
    assert 'synthetic-private-version' not in json.dumps(command);calls.append(command[2])
    if mode=='interrupt': raise KeyboardInterrupt()
    if mode=='spawn-error': return real_run([str(paths[-1].parent/'missing-executable')],**kw)
    kw['env']=dict(kw['env'],SPEEDY_CLEANUP_FIXTURE_STATE=str(state),SPEEDY_CLEANUP_FIXTURE_MODE=mode)
    if mode=='timeout':kw['timeout']=1
    return real_run([sys.executable,'-c',child,*command[1:]],**kw)
def removed(): assert all(f.closed for f in files) and all(not p.exists() and not p.parent.exists() for p in paths)
with tempfile.TemporaryDirectory(prefix='synthetic-cleanup-test-') as folder:
    state=pathlib.Path(folder)/'state';state.write_text('0')
    with patch.object(c.tempfile,'NamedTemporaryFile',side_effect=observe_file),patch.object(c.subprocess,'run',side_effect=spawn):
        out=c.cleanup(c.RUN_ID);assert out['result']=='CLEANUP_CONFIRMED' and out['deletedVersions']==2 and out['emptyVersionInventory'] is True
        assert len(calls)==5;removed()
        before=len(calls)
        assert c.cleanup(None)['result']=='STOP_CLEANUP_AUTHORIZATION_REQUIRED' and len(calls)==before
        bad=[('s3api','put-object',{}),('s3api','list-object-versions',{'Bucket':c.BUCKET,'ExpectedBucketOwner':'wrong','Prefix':c.PREFIX}),
             ('s3api','list-object-versions',{'Bucket':'wrong','ExpectedBucketOwner':c.ACCOUNT,'Prefix':c.PREFIX}),
             ('s3api','list-object-versions',{'Bucket':c.BUCKET,'ExpectedBucketOwner':c.ACCOUNT,'Prefix':'production/'}),
             ('s3api','delete-object',{'Bucket':c.BUCKET,'ExpectedBucketOwner':c.ACCOUNT,'Key':'production/0001.json'})]
        for args in bad:
            try:c.cli(*args);raise AssertionError('Wrong target reached child')
            except RuntimeError:pass
        assert len(calls)==before
        for mode,expected in [('app-identity','STOP_OPERATOR_ACCOUNT_REQUIRED'),('wrong-account','STOP_OPERATOR_ACCOUNT_REQUIRED'),('unknown','STOP_UNEXPECTED_SYNTHETIC_INVENTORY')]:
            state.write_text('0');out=c.cleanup(c.RUN_ID);assert out['result']==expected and state.read_text()=='0';removed()
        for mode in ['error','malformed','timeout','spawn-error']:
            try:c.cli('s3api','list-object-versions',{'Bucket':c.BUCKET,'ExpectedBucketOwner':c.ACCOUNT,'Prefix':c.PREFIX});raise AssertionError('Failure accepted')
            except RuntimeError as error:
                assert str(error).startswith('STOP_') and 'SYNTHETIC_PRIVATE_RESPONSE' not in str(error) and str(paths[-1]) not in str(error)
            removed()
        mode='interrupt'
        try:c.cli('s3api','list-object-versions',{'Bucket':c.BUCKET,'ExpectedBucketOwner':c.ACCOUNT,'Prefix':c.PREFIX});raise AssertionError('Interruption ignored')
        except KeyboardInterrupt:pass
        removed();before=len(calls)
        def partial(value,stream):stream.write('SYNTHETIC_PRIVATE_RESPONSE');raise TypeError('SYNTHETIC_PRIVATE_RESPONSE')
        with patch.object(c.json,'dump',side_effect=partial):
            try:c.cli('s3api','list-object-versions',{'Bucket':c.BUCKET,'ExpectedBucketOwner':c.ACCOUNT,'Prefix':c.PREFIX});raise AssertionError('Partial input used')
            except RuntimeError as error:assert str(error)=='STOP_OPERATOR_ACCESS_OR_REQUEST_FAILURE'
        assert len(calls)==before;removed()
        mode='fail-second-delete';state.write_text('0');before=len(calls)
        out=c.cleanup(c.RUN_ID);assert out['result']=='STOP_PARTIAL_CLEANUP_REVIEW_REQUIRED' and out['deletedVersions']==1
        assert out['emptyVersionInventory']=='UNVERIFIED' and state.read_text()=='1' and len(calls)==before+4
        assert 'synthetic-private-version' not in json.dumps(out);removed()
print(json.dumps({'check':'SYNTHETIC_CLEANUP_REAL_BOUNDARY','passed':True,'cloudCalls':0}))
`;
  const output = execFileSync('python3', ['-B', '-c', code], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  assert.deepEqual(JSON.parse(output), { check: 'SYNTHETIC_CLEANUP_REAL_BOUNDARY', passed: true, cloudCalls: 0 });
});
test('manual cloud harness rejects missing authorization, wrong identity and unsafe targets before cloud writes', () => {
  const { guardedIdentity, RUN_ID, RUN_BUDGET: b } = require('./privacyRecoveryCloud.cjs');
  assert.ok(b.processCalls * b.phases + b.fixedProbeCalls <= 10000);
  assert.ok(b.processPuts * b.phases + b.fixedProbePuts <= 150);
  const calls = b.processCalls * b.phases + b.fixedProbeCalls;
  const conservativeUsd = calls / 1000 * 0.0055 + calls * b.objectBytes / (1024 ** 3) * 0.09;
  assert.ok(conservativeUsd < 0.10, 'Bounded two-process requests/transfer must fit the stated future-test estimate');
  const e = { NODE_ENV: 'test', PRIVACY_SYNTHETIC_DATABASE: 'yes', PRIVACY_S3_CLOUD_VERIFICATION_AUTHORIZED: RUN_ID,
    DATABASE_URL: 'postgresql://privacy_test:synthetic-only@127.0.0.1/speedy_privacy_synthetic', AWS_ACCESS_KEY_ID: 'synthetic', AWS_SECRET_ACCESS_KEY: 'synthetic',
    PRIVACY_DELETION_ENABLED: 'false', PRIVACY_FULFILLMENT_ENABLED: 'false', PRIVACY_VERIFICATION_EMAIL_ENABLED: 'false', PRIVACY_VERIFICATION_PHONE_ENABLED: 'false' };
  assert.throws(() => guardedIdentity({ ...e, PRIVACY_S3_CLOUD_VERIFICATION_AUTHORIZED: undefined }, () => assert.fail('Must not authenticate')), /AUTHORIZATION/);
  assert.throws(() => guardedIdentity(e, () => ({ Account: '080413009273', Arn: 'wrong-user' })), /IDENTITY_MISMATCH/);
  assert.throws(() => guardedIdentity({ ...e, DATABASE_URL: 'postgresql://privacy_test:synthetic@production.example/speedy_privacy_synthetic' }, () => assert.fail('Wrong target authenticated')));
  assert.equal(guardedIdentity(e, () => ({ Account: '080413009273', Arn: 'arn:aws:iam::080413009273:user/SpeedyPrivacyJournalApplication' })).prefix,
    'verification/recovery-integration-20261028/journal/');
});
