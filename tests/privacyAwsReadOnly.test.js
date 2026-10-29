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
    if operation == 'get-caller-identity': return {'Account': 'wrong' if mode == 'wrong' else m.ACCOUNT, 'Arn': 'arn:aws:iam::'+m.ACCOUNT+':user/SyntheticOperator'}
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
  const output = execFileSync('python3', ['-c', code], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const result = JSON.parse(output); assert.equal(result.passed, 12); assert.equal(result.cloudCalls, 0);
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
