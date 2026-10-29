# S3 privacy decision store — production review package, 2026-10-29

**CURRENT REVIEW ENTRY POINT:** use [Production deployment, enrollment and operator
reconciliation package](#production-deployment-enrollment-and-operator-reconciliation-package)
below. This pass prepares documentation only. Completed configuration inventory,
cloud run 40878909548 (5/5), cleanup (37 versions/markers, empty inventory), GitHub
test-environment removal and owner-confirmed temporary IAM cleanup remain closed.
Do not rerun them. Earlier pending/next-action statements describe their dated stage;
the production package below supersedes them without changing the saved evidence.

Latest integration supersedes the earlier proposal's unknown-account/unimplemented
status. Robert completed the AWS setup below; these are owner-confirmed facts,
pending authenticated read-back. Agent work is source/synthetic preparation only:
no AWS write, credential retrieval, deployment, enrollment or activation occurred.
Preserve `357a552`, `e998189`, the tested S3 adapter `5a222be`/`5922a80`, and all
business/device/provider/OpenAI approvals and evidence. Android remains deferred.

Current read-only Render deployment metadata: API `dep-dbh39puc6qcc73cfb0d0` and
dispatcher `dep-dbh39q8u01pc73fg6ufg` are live at
`007cba92ce38132946283f1d67155e809aa9588b`. Main's dispatcher-standards change is
merged into this review branch (`77a84a5`); no migration or runtime-pin conflict.
The older `4ac2ba3` evidence remains historical, not the assumed current revision.
Four privacy gates remain false and Auto-Deploy Off on owner evidence.

## Owner-confirmed AWS setup and next read-only action

- Read-only follow-up, October 28: Robert ran
  `aws sts get-caller-identity --query Account --output text --region ca-central-1 --no-cli-pager`
  in CloudShell and observed `080413009273`: **owner-observed account pass**.
  The earlier `c94fb78` checker returned `STOP_ACCOUNT_UNVERIFIED` in that same
  session. It discarded the exception category/exit code, so the original CLI
  failure is not recoverable from that output. This is not evidence of an IAM or
  credential fault. Bucket settings and application credentials remain unverified.
- Robert's subsequent revised CloudShell run: primary identity and direct account
  comparison PASS, exit 0, account matches. `legacyStdinJson` and every parameterized
  S3/IAM check returned `CLI_INPUT_JSON_OR_STDIN`, exit 252; result REVIEW_REQUIRED,
  objectsRead 0 / writes 0. This identifies the shared stdin/JSON invocation failure,
  not an AWS bucket, credential or IAM-policy failure. No inventory pass is claimed.
- Account `080413009273`, Speedy Sweeties; bucket
  `speedy-sweeties-privacy-decisions-080413009273`, `ca-central-1`.
- Versioning Enabled; Block All Public Access ON; SSE-S3; Object Lock disabled;
  Bucket owner enforced / ACLs disabled.
- Bucket policy saved from the repository, with actual account/bucket and both
  original role ARNs plus `arn:aws:iam::080413009273:user/SpeedyPrivacyJournalApplication`
  in its trust-control restriction. The checked-in template now matches those facts.
- IAM user `SpeedyPrivacyJournalApplication`, no console access, only
  `SpeedyPrivacyJournalApplicationPolicy` attached. `SpeedyPrivacyJournalOperatorPolicy`
  exists but is unattached. No operator role or session is assumed to exist.
- Existing application access key saved privately as `AWS_ACCESS_KEY_ID` and
  `AWS_SECRET_ACCESS_KEY` on production API using **Save only**. No key was retrieved,
  rotated or recreated. Saved settings do not establish a running connection.
- Render workspace is Hobby. Managed AWS OIDC requires Pro; no upgrade is proposed.
  See [Render's current OIDC documentation](https://render.com/docs/oidc).

`scripts/privacyAwsReadOnly.py` is the prepared AWS CloudShell checker. It first
matches STS account, then inspects only configuration/IAM metadata: region, versioning,
public blocks/status, SSE-S3, ownership, Object Lock, lifecycle, replication, exact
reviewed bucket/policy documents, user identity/console profile, attached/inline/group
policies, permissions boundary, and key status/create/last-used metadata. It prints
no key IDs/endings, secret values, policy documents or object contents. Missing
permissions are UNVERIFIED. Organization controls remain unverified. Administrator
read-back cannot establish the application's restricted credentials or saved Render
values work. No authenticated AWS connector/CLI session is available to this agent;
the final handoff supplies one pinned, checksum-verified CloudShell loader command.

### Authenticated configuration inventory — owner-supplied PASS

Robert supplied the corrected CloudShell result on October 28:
`READBACK_PASS_LIVE_APPLICATION_ACCESS_UNVERIFIED`, accountMatches true, all reported
configuration checks true, one active application key, operator policy unattached,
objectsRead 0 / writes 0. Record this as **owner-supplied authenticated AWS
configuration evidence**, not an agent-executed read-back. The completed inventory
must not be rerun. Prior stdin-failure evidence remains historical below.

Application credential access is **untested, not failed**. This inventory does not
match the saved Render credential, prove a running connection, test real S3 access/
conditional writes or verify recovery/latency/cleanup. Organization controls remain
unverified. No key, IAM/bucket setting, production gate or deployment changed.

### Shared private-file correction — preserved source evidence

Current checker source: `0dc48786e82be413bb70cedac57bc35b26787040`. Every parameterized
S3/IAM call now uses the same secure local JSON-file path, not `/dev/stdin`:

- Securely created random temporary directory, explicitly mode 0700; named JSON
  file explicitly mode 0600. Parameters are UTF-8 JSON, fully written and closed
  before starting AWS CLI. Only the random `file://` path enters arguments, never
  JSON contents or key identifiers. Child stdin is `DEVNULL` for all calls.
- `finally` unlinks the input file and cleans the directory on success, CLI error,
  process-start failure, malformed output, timeout, partial preparation or interruption.
  Cleanup failure stops inventory with sanitized `STOP_PRIVATE_INPUT` evidence;
  it is not silently ignored. Abrupt OS termination cannot guarantee Python finally
  blocks ran; no claim of secure physical erasure is made.
- Parameterless STS remains parameterless and creates no input file. The failing
  legacy stdin diagnostic is removed. The handoff command runs the normal guarded
  inventory with one primary account call, without repeating the direct comparison.
  Optional `--diagnose-identity` is retained with only one direct account comparison,
  at most two identity calls total; it cannot override a failed primary target check.
- Every expected-owner, account and read-only operation restriction remains. No
  credential, policy, permission, bucket setting or production configuration changed.
  `AWS_IGNORE_CONFIGURED_ENDPOINT_URLS=true` remains on normal calls; the optional
  direct comparison inherits the CLI endpoint environment, never saved settings.
- Each child retains its 25-second process limit, 5-second connection / 15-second
  read limits and `AWS_MAX_ATTEMPTS=1`. No automatic retries. Sanitized diagnostics
  retain actual exit codes (null if unavailable), allowlisted provider codes and
  fixed failure categories. Paramfile/JSON failures now use `CLI_INPUT_JSON_OR_FILE`;
  private preparation/removal failures have dedicated categories. No raw stdout,
  stderr, local paths, key IDs, ARNs, credentials or object contents are printed.

Focused serial local checks: 4/4 groups PASS. Seven actual synthetic child processes
read the complete closed files, assert file/directory permissions and ownership,
and verify IAM/S3 inputs and unchanged expected owner. Permissive/restrictive umasks,
success, real nonzero exit, malformed output, actual subprocess timeout, start
failure, interruption, partial JSON write, cleanup failure/stop and redaction pass.
These are not mocked AWS responses alone; no AWS CLI or cloud call ran on this Mac.
At source preparation, authenticated inventory/application access were unverified.
The later owner inventory PASS above closes configuration only; application access
and controlled cloud behavior remain untested. No dependency installed.
Both normal Linux Node 24.22.1 CI jobs (`validate`, `privacy-database`) PASS at
`0dc48786e82be413bb70cedac57bc35b26787040` in
[CI 40808636607](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40808636607).
The immutable public artifact also returned HTTP 200 with the expected checksum;
it was not executed against AWS. Later handoff commits change documentation only.

Do not rotate keys or change permissions to make the checker pass.
Official references: [STS options](https://docs.aws.amazon.com/cli/latest/reference/sts/get-caller-identity.html),
[CLI return codes](https://docs.aws.amazon.com/cli/latest/userguide/cli-usage-returncodes.html),
[AWS CLI JSON input handling](https://github.com/aws/aws-cli/blob/v2/awscli/customizations/cliinput.py)
and [local paramfile handling](https://github.com/aws/aws-cli/blob/v2/awscli/paramfile.py).

Earlier account-only source `f71a990fcd59d9b04039e1998757cb53f841c00b`: focused serial Mac
metadata/CLI/cloud-guard groups 3/3 PASS, help and whitespace checks PASS; no AWS
calls. Normal Linux Node 24.22.1 branch CI `validate` and `privacy-database` both
PASS in [CI 40807298550](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40807298550).
That CI uses only synthetic fixtures and controlled responses, not AWS credentials.

## Production startup/configuration source — implemented, not deployed

The existing privacy router lazily constructs the S3 journal only after its existing
deletion gate allows the request. Missing/mismatched pins, dedicated credentials,
wrong/absent/unfinished/sealed history stop affected privacy reads/transitions.
There is no enrollment, memory fallback or JWT fallback. Gates-off ordinary reads/
ordering/startup do not contact S3 and remain available without these settings.
The existing financial expiry/redaction/ownership guards are unchanged.

Future saved settings, after review; **do not change them during this pass**:

| Name | Exact initial value / rule |
| --- | --- |
| `PRIVACY_RECOVERY_S3_BUCKET` | `speedy-sweeties-privacy-decisions-080413009273` |
| `PRIVACY_RECOVERY_S3_EXPECTED_OWNER` | `080413009273` |
| `PRIVACY_RECOVERY_S3_REGION` | `ca-central-1` |
| `PRIVACY_RECOVERY_S3_PREFIX` | `production/epoch-0001/` |
| `PRIVACY_RECOVERY_SCOPE` | `speedy-privacy-production-epoch-0001` |
| `PRIVACY_RECOVERY_ENROLLMENT_HASH` | Exact first-entry HMAC from separately authorized enrollment; currently unknown. Never insert a dummy hash. |
| `PRIVACY_DIGEST_KEY` | Preserve the existing stable, dedicated securely retained key; at least 32 characters, distinct from JWT. Never rotate it to resolve missing history. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Existing saved IAM-user credentials only, kept private. Credentials are captured process-locally; no profile/metadata/OIDC fallback. |

An epoch's prefix and scope must agree; a reviewed successor may advance both and
the enrollment hash together. Store/pin them outside PostgreSQL and read back the
running process after a future approved deployment. Conflicting `AWS_SESSION_TOKEN`,
`AWS_ROLE_ARN` or `AWS_WEB_IDENTITY_TOKEN_FILE` stops this IAM-user configuration.
All four original privacy gates stay exactly `false`; no additional activation
flag or background enrollment is introduced. No deployment merely to load Save-only
credentials/sender is warranted by this preparation.

## Production deployment, enrollment and operator-reconciliation package

### 1. Exact candidate and scope — October 29 read-only refresh

| Item | Observed revision / evidence |
| --- | --- |
| API live | `007cba92ce38132946283f1d67155e809aa9588b`, `dep-dbh39puc6qcc73cfb0d0`, live since 2026-10-28T17:48:03Z |
| Dispatcher live | Same `007cba9`, `dep-dbh39q8u01pc73fg6ufg`, live since 2026-10-28T17:47:07Z |
| Cron last live build | `c5f249fc079f2faa5ff99c61b193a0626eccc3aa`, `dep-dbg083uk1f9s73aunkd0`; do not run/redeploy it |
| Current fetched main | `ac1a69b13211b8612213ade951a3db15b5142a90` |
| Immutable application candidate | `0230095ce0076baab30db880c7c4c3abea7fdd45`, existing `review/customer-account-deletion`; this package's later documentation commit does not alter its executable tree |
| Tested executable source | `a692b0da41fe3c0d4a0bd8d4e6e3f13a349d16fa`; only three backend documentation files differ through `0230095` |
| Reused Linux CI | [40811316279](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40811316279): `validate` and `privacy-database` SUCCESS on exact `a692b0d`; both jobs also SUCCESS for main `ac1a69b` in [40811821631](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40811821631) |
| Live synthetic verification | [40878909548](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40878909548), exact `5e0791d`, code identical to `a692b0d`; 5/5 recovery tests and controlled probes PASS, cleanup complete |

Render metadata was read in the previously confirmed Speedy's workspace
`tea-d7loaul7vvec73cme5d0`. API/dispatcher/cron each still report `autoDeploy=no` /
`autoDeployTrigger=off`. No setting, deploy, database or AWS object changed. Live
metadata is not a new health/session test. Keep prior staff/device/provider results.
No CI run exists for documentation-only `0230095` (`[skip ci]`); do not mislabel it
as a newly tested head. Reuse unchanged source evidence, subject to merge protections.

**Undeployed executable changes**, relative to live `007cba9`:

- `privacyDeletion.service.ts` journals relevant transitions with independent INTENT
  before DB commit and COMMIT afterward; reads/transitions fail closed on bad history.
- `privacy.routes.ts` lazily wires the dedicated S3 journal after the deletion gate.
- `privacyRecoveryJournal.ts`, `privacyRecoveryState.ts`, `privacyRecoveryS3.ts` and
  `privacyRecoveryConfiguration.ts`: authenticated minimized history, conditional
  immutable appends and exact external pins. Official SDK dependency is pinned to
  `@aws-sdk/client-s3` **3.1158.0** with lockfile changes; Node stays **24.22.1**.
- `privacyRecovery.service.ts`: guarded **synthetic-only** restore reconciliation;
  `privacyRecoveryMaintenance.ts` / `privacyRecoveryRetirement.ts`: offline successor
  and retired-history libraries, not production commands or public routes.
- Backend-served `dispatcherHelpKnowledge.ts` documents fail-closed/operator stops;
  no dispatcher UI/bundle change. CI adds serial restore checks; synthetic tests and
  AWS inventory/cleanup scripts are test/operator facilities, not runtime jobs.
- Documentation, policy templates and unpublished Webflow drafts are review assets,
  not deployed customer-policy claims. No new Prisma schema or migration differs
  from main/live; all four original privacy migrations remain already deployed.

**Integration still required before a main release:** main is two commits ahead of
the branch's ancestry (PR 98 workflow registration); the branch has 32 commits not
in main at this refresh. The workflow blob is byte-identical on both sides
(`5c32bdb415c5a879639eb55726bd29b029d4adf5`). No executable conflict is identified;
no merge was performed. A future reviewed integration must preserve that file and
both CI jobs/Node pins/full-history help checks. Use a **new review PR** from the
existing branch: PR 93 is already merged, not an open deployment vehicle. Do not
reopen/re-merge PR 93 or bypass required checks. Record the actual integration/
merge SHA and successful required checks; never invent that future SHA. Any new
operator source changes require their own focused checks and CI before inclusion.

### 2. One consolidated approval boundary and ordered deployment

**Proposed next production step A (not executed/approved by this document):** merge
only the reviewed recovery candidate after the integration/check gate above, then
manually deploy **speedy-api only**, with all four gates exactly false. Record the
resulting release SHA as `RELEASE_SHA`; its application tree must equal reviewed
`0230095` unless separately reviewed tooling is added. Dispatcher, cron, ordering
staging and the SMS resources are excluded. No new migration, paid resource, message,
enrollment, AWS write, website publication or Apple upload belongs to step A.

**Step B (separate explicit enrollment boundary):** one initial journal entry plus
external configuration pins/read-only application verification, only after the
operator/tooling prerequisites in section 3 are satisfied. **Not executable-ready
today**; do not fold it silently into step A. **Step C**, customer initiation/channel
activation and later fulfillment, needs its own approval and final launch evidence.
Existing retention/contact/fiscal/review decisions are not reopened by these gates.

| Order | Responsible operator and exact action | Expected result / stop |
| --- | --- | --- |
| A0 | Release engineer: fetch refs, preserve local changes, compare approved tree/main/live revision; recheck protections and required CI on the actual integration | Stop on executable scope change, failed/pending required check or concurrent deploy; no force push |
| A1 | Robert: Render Dashboard → Speedy's workspace → each of speedy-api, speedy-dispatcher, speedy-retention-90-day → Settings → Auto-Deploy | Off on all three; preserve schedules, operational env and secrets |
| A2 | Robert: workspace → speedy-api → Environment; review only the configuration below, Save only if correction is separately approved | All four gates literally `false`; stable digest and original AWS pair preserved. Do not copy synthetic/CI configuration |
| A3 | Engineer: after merge authorization, record the actual merge SHA; Robert/authorized deploy operator: speedy-api → Deploys → Manual Deploy → Deploy a specific commit → that full `RELEASE_SHA` | One API build only; not Deploy latest commit, Restart, or dispatcher/cron deployment |
| A4 | Render build, then pre-deploy, then start in the existing sequence below | Any failed command stops rollout; no retry/mark-success workaround |
| A5 | Engineer/Robert: perform only the safe verification below; preserve sanitized results/actual deploy ID | Exact revision, Node pin, health, expected schema/guards, false gates, disabled route. Gate-off health alone does not prove S3 access |
| A6 | Robert: leave Auto-Deploy Off; keep all four gates false; retain config/key backup and release evidence | No customer activation; enrollment remains a recorded separate stop |

Observed API commands (preserve, do not replace):

```text
Build:      npm ci --include=dev && node ./node_modules/prisma/build/index.js generate && npm run build
Pre-deploy: npx prisma migrate deploy
Start:      npm run start
Health:     /api/v1/health/ready
```

No new migration is expected: require the four original completed migrations in
order (`20261023030000_customer_privacy_requests`,
`20261023150000_privacy_access_credentials`,
`20261023190000_adopt_retention_policy`,
`20261023220000_approved_privacy_review_dates`), no unresolved failure and four
enabled protection triggers. A stale `48 completed` count is historical, not a
hard-coded future expected total; compare the exact candidate migration inventory.
Unexpected pending SQL is a stop before `migrate deploy`, not permission to apply it.

#### Private configuration — retain, do not dump

Ordinary startup still needs the existing DATABASE_URL/JWT/Firebase/CORS/port and
operational alert settings; preserve them, not a copied test environment. Privacy
construction is lazy and gates-off startup/ordering does not require enrollment
or contact S3. No background recovery hook is added. Existing ordinary production
monitors still run normally; do not start `server.ts` for an offline operator check.

Keep these approved API values, verifying equality without displaying secrets:

```text
PRIVACY_DELETION_ENABLED=false
PRIVACY_FULFILLMENT_ENABLED=false
PRIVACY_VERIFICATION_EMAIL_ENABLED=false
PRIVACY_VERIFICATION_PHONE_ENABLED=false
PRIVACY_ADMIN_USER_IDS=afca21ae-4c43-4c14-a2a7-f3ad790b12dc
PRIVACY_APPROVED_RETENTION_POLICY=SS-RETENTION-2026-10-23
PRIVACY_COMPLETION_TIMEFRAME=Normally within 30 calendar days after verification; an ownership conflict or legal hold may require longer.
PRIVACY_FISCAL_YEAR_END_MM_DD=12-31
```

Preserve stable PRIVACY_DIGEST_KEY (privately retained; >=32 characters, not JWT),
existing AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY and all provider credentials. No
rotation/retrieval into chat/logs. Saved Resend sender loads on a future normal
deploy; that does not authorize sending. No conflicting AWS_SESSION_TOKEN,
AWS_ROLE_ARN or AWS_WEB_IDENTITY_TOKEN_FILE may be present for this application
IAM-user mode. Do not upgrade Hobby or attach the broad operator policy to the app.

The five non-secret S3 resource pins are the exact table above: bucket, owner,
region, `production/epoch-0001/`, `speedy-privacy-production-epoch-0001`. The sixth,
PRIVACY_RECOVERY_ENROLLMENT_HASH, is **unknown until observed enrollment**. Leave
it unset rather than invent one; this blocks privacy, not ordinary ordering.
If the five pins are saved during an approved release, loading them is not enrollment.
After B the observed hash must be saved outside PostgreSQL and a normal same-SHA
API deployment is needed to load it; Restart does not load Save-only changes.

#### Read-only post-deploy verification commands — future approved step A only

In a **new** speedy-api Shell (workspace → speedy-api → Shell), first replace the
literal `RECORDED_RELEASE_SHA` with the actual recorded SHA, not a branch name:

```sh
node <<'SPEEDY_RECOVERY_RELEASE_READONLY'
const e=process.env;
const gates=['PRIVACY_DELETION_ENABLED','PRIVACY_FULFILLMENT_ENABLED','PRIVACY_VERIFICATION_EMAIL_ENABLED','PRIVACY_VERIFICATION_PHONE_ENABLED'];
const r={check:'SPEEDY_RECOVERY_RELEASE_READONLY',targetMatches:e.RENDER_SERVICE_ID==='srv-d7ntlnpkh4rs73bev9q0',revisionMatches:e.RENDER_GIT_COMMIT==='RECORDED_RELEASE_SHA',production:e.NODE_ENV==='production',nodeMatches:process.version==='v24.22.1',allFourGatesFalse:gates.every(k=>e[k]==='false'),dedicatedDigestPresent:typeof e.PRIVACY_DIGEST_KEY==='string'&&e.PRIVACY_DIGEST_KEY.length>=32,digestDistinctFromJWT:!!e.PRIVACY_DIGEST_KEY&&e.PRIVACY_DIGEST_KEY!==e.JWT_SECRET,awsPairPresent:!!e.AWS_ACCESS_KEY_ID&&!!e.AWS_SECRET_ACCESS_KEY,noConflictingAWSProvider:!e.AWS_SESSION_TOKEN&&!e.AWS_ROLE_ARN&&!e.AWS_WEB_IDENTITY_TOKEN_FILE,adminMatches:e.PRIVACY_ADMIN_USER_IDS==='afca21ae-4c43-4c14-a2a7-f3ad790b12dc',policyMatches:e.PRIVACY_APPROVED_RETENTION_POLICY==='SS-RETENTION-2026-10-23',timeframeMatches:e.PRIVACY_COMPLETION_TIMEFRAME==='Normally within 30 calendar days after verification; an ownership conflict or legal hold may require longer.',fiscalMatches:e.PRIVACY_FISCAL_YEAR_END_MM_DD==='12-31'};
console.log(JSON.stringify(r));process.exitCode=Object.entries(r).some(([k,v])=>k!=='check'&&v!==true)?1:0;
SPEEDY_RECOVERY_RELEASE_READONLY
```

Presence checks do not prove secret continuity or access. Robert must confirm the
same retained digest/private AWS pair was preserved; do not publish a fingerprint
or retrieve values to make that check. Check schema/migrations through the existing
read-only production procedure, not `prisma migrate dev`, seed or reset commands.
Run the following in the new Shell; it prints only safe assertions and makes three
GETs, no retry, no customer/authentication/provider calls:

```sh
node <<'SPEEDY_RECOVERY_HTTP_READONLY'
(async()=>{const base='https://speedy-api-lbfe.onrender.com/api/v1';const results=[];
for(const [path,want] of [['/health/live',200],['/health/ready',200],['/privacy/deletion/admin/requests',503]]){
 const r=await fetch(base+path,{redirect:'error',signal:AbortSignal.timeout(5000)});const j=await r.json();
 const pass=r.status===want&&(path==='/health/ready'?j.checks?.database==='ok':path.startsWith('/privacy/')?j.code==='PRIVACY_SERVICE_UNAVAILABLE'&&r.headers.get('cache-control')==='no-store':j.success===true);
 results.push({path,status:r.status,pass});if(!pass)break;
}const pass=results.length===3&&results.every(x=>x.pass);console.log(JSON.stringify({check:'SPEEDY_RECOVERY_HTTP_READONLY',results,pass}));process.exitCode=pass?0:1;
})().catch(()=>{console.log(JSON.stringify({check:'SPEEDY_RECOVERY_HTTP_READONLY',result:'STOP_NETWORK_OR_RESPONSE'}));process.exitCode=1;});
SPEEDY_RECOVERY_HTTP_READONLY
```

No S3 request is made by the disabled route. Do not use loyalty GET (can reset
counters), mutation endpoints, AI help, new login, order creation or codes as smoke
tests. Existing staff-read passes are retained; a new authenticated staff read is
optional only with an existing valid session and sanitized schema/status output.
Dispatcher deployment is unnecessary because its bundle is byte-identical.

### 3. Explicit production enrollment — tooling/principal stop, not an invented command

**Named responsibility:** Robert is the owner/privacy operator and release approver;
the engineer prepares/reviews the guarded commands. The actual authorized **AWS
operator principal is not yet established**. Use Robert's existing MFA-backed
non-application owner/federated session, only after privately confirming its STS
account is `080413009273`, principal and MFA/session provenance. No operator role
is assumed; the permanent operator policy remains unattached. Do not use the
application identity/key to enroll (its explicit deny of key 1 must remain).
No new account/user/key or plan upgrade is needed or authorized by this package.

Minimum temporary enrollment permissions for the chosen existing operator session:

| Action | Exact resource / condition |
| --- | --- |
| `s3:ListBucket`, `s3:ListBucketVersions` | `arn:aws:s3:::speedy-sweeties-privacy-decisions-080413009273`; `s3:prefix` exactly `production/epoch-0001/` |
| `s3:GetObject` | That bucket's `production/epoch-0001/*`, current objects only; authenticating history stays private |
| `s3:PutObject` | Only `production/epoch-0001/0000000000000001.json`; `s3:if-none-match=*`, `s3:x-amz-server-side-encryption=AES256` |

STS identity check needs no app secret. No delete, old-version GET, wider-prefix PUT,
IAM/bucket configuration, lifecycle or trust-control grant is required. Existing
bucket TLS/create-only/encryption/delete denies remain. Do not attach the larger
permanent operator policy merely for enrollment; the chosen temporary session/
prefix grant needs review and must be removed after read-back. From AWS Console
start → correct account → IAM → the **privately verified existing principal** →
Permissions, review only this session-scoped grant; if there is no suitable session,
stop and identify its actual principal before proposing a change. No permission
change is made now. Restore reconciliation needs PostgreSQL write access separately;
this enrollment grant never authorizes customer-data repair.

**Missing executable tooling (genuine prerequisite B0):** there is no production
enrollment CLI/target adapter, and `reconcileSyntheticRestore` rejects anything but
the guarded synthetic localhost database/user. Do not run that test entry point
against production or edit its guard. `enrollEmptyDatabase()` is a library, not a
target-verified production command; its check covers four decision tables, not the
complete production baseline below. There is also no reviewed unfinished-operation
resolver, dry-run/apply production wrapper or production successor-maintenance CLI.
Thus enrollment/reconciliation are not claimed runnable. The smallest remaining
source task is narrowly guarded offline wrappers around these existing libraries,
with synthetic guard/failure tests and CI, not another deletion/storage system.

The wrappers must verify service/workspace, database **resource ID**
`dpg-d7m33g2qqhas73f58hrg-a` and its privately resolved exact hostname/name/user via
Render metadata, not a matching DB name alone. They must use the stable digest from
existing private configuration and a separate ephemeral MFA operator SDK session;
never copy either to source/arguments/logs/CI. Import only pure modules and Prisma,
not app/server startup, delivery, alerts or jobs. Revoke temporary access/close
connections on exit. No automatic enrollment/fallback, no blind PUT reruns.

**Actual baseline before enrollment (B1, newly observed then, not old zero counts):**
with all privacy gates false and all privacy writers excluded, use one bounded
read-only consistent transaction first. Verify resource/schema/guards/migrations,
then output counts only, with no IDs/rows/contacts. The production wrapper must
hold the existing privacy advisory lock/recheck under an enrollment exclusion
window immediately before its write; the library's separate count checks alone
are not sufficient concurrency control. These read-only baseline queries illustrate
the exact coverage, not a standalone enrollment authorization:

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SELECT 'PrivacyChallenge' AS kind, count(*) AS rows FROM "PrivacyChallenge"
UNION ALL SELECT 'PrivacyAccessCredential', count(*) FROM "PrivacyAccessCredential"
UNION ALL SELECT 'PrivacyDeletionRequest', count(*) FROM "PrivacyDeletionRequest"
UNION ALL SELECT 'PrivacyAudit', count(*) FROM "PrivacyAudit"
UNION ALL SELECT 'PrivacyExternalTask', count(*) FROM "PrivacyExternalTask"
UNION ALL SELECT 'PrivacyDeletedIdentity', count(*) FROM "PrivacyDeletedIdentity"
UNION ALL SELECT 'CustomerPrivacyState', count(*) FROM "Customer"
 WHERE "privacyVerifiedEmail" IS NOT NULL OR "privacyVerifiedEmailAt" IS NOT NULL
UNION ALL SELECT 'OrderPrivacyState', count(*) FROM "Order"
 WHERE "privacyErasedAt" IS NOT NULL OR "privacyRetainUntil" IS NOT NULL
UNION ALL SELECT 'ReceiptRetainedEvidence', count(*) FROM "DigitalReceipt"
 WHERE "retainedChargeEvidence" IS NOT NULL;
COMMIT;
```

Also verify exact production-prefix version inventory is empty (no old versions,
delete markers or unexpected keys), using expected owner and bounded pagination.
Do not treat missing permission/403 as emptiness or rerun the completed broad AWS
inventory. No current production baseline/S3-prefix read is asserted by this pass.

- All decision indicators zero and truly empty prefix: B2 may call
  `PrivacyRecoveryJournal.enrollEmptyDatabase()` once via the approved guarded
  wrapper, using store mode `enrollment`. It creates exactly sequence 1, GENESIS,
  HMAC-authenticated `{format:1,emptyDecisionBaseline:true}` with conditional
  `IfNoneMatch:*` / AES256. The app cannot create this entry. No record is removed.
- Any nonzero indicator: **STOP empty-baseline enrollment**, preserve state. Coverage
  must account for every request/version/source scope, cancellation/hold/erasure,
  external outcome, original due/closure/review/financial date, access revocation and
  existing marker under the stable key, supported by complete attributable evidence.
  `prepareRecoverySuccessor` only covers an already authenticated source journal;
  it is **not** an importer for pre-journal DB decisions. No production nonempty
  bootstrap/importer is implemented. Any required reviewed coverage importer is
  another bounded source prerequisite; never label nonempty history GENESIS or
  delete it to pass enrollment. Challenge/access-only state also needs an explicit
  reviewed disposition; no automatic purge/expiry inference.
- A lost enrollment acknowledgement is an uncertain outcome: inspect the same
  first entry/current history privately, validate scope/key/canonical payload and
  baseline, then record the observed result. Never recreate, overwrite, advance
  epoch, invent a hash or treat an unreadable prefix as not enrolled.

**B3 external pin:** obtain the observed first-entry HMAC from authenticated read-back
(64 lowercase hex). Store the exact owner/bucket/region/prefix/scope/hash together
in protected release configuration **outside PostgreSQL**, with access limited to
Robert/release operator and the existing securely retained stable key separately.
Do not store the only copy in a database backup or a temporary local file. Render
Dashboard → workspace → speedy-api → Environment → add the six exact recovery
variables from the table (hash only from B2) → Save only. Preserve all four false
gates, the existing AWS pair and digest. Record boolean equality/pin presence, not
secret values. Update Robert's protected config record; confirm exact pins privately.
The proposed external pin record uses existing Render configuration plus Robert's
protected retained release record; the latter's exact storage/access location is
not established and must be confirmed privately. This is not a newly provisioned
service or a claim that a temp file is durable storage.

**B4 load pins and verify restricted app reads:** after separate approval, perform
one **normal same-RELEASE_SHA API-only deployment** to load saved pins, not Restart.
Health does not call S3; in a fresh Shell, use the following after replacing the
literal SHA. It uses only captured existing app credentials and reads current history;
no imports of app/server/Prisma, no journal append and no output of entry bodies:

```sh
node <<'SPEEDY_RECOVERY_APP_READONLY'
(async()=>{const e=process.env;const gates=['PRIVACY_DELETION_ENABLED','PRIVACY_FULFILLMENT_ENABLED','PRIVACY_VERIFICATION_EMAIL_ENABLED','PRIVACY_VERIFICATION_PHONE_ENABLED'];
if(e.RENDER_SERVICE_ID!=='srv-d7ntlnpkh4rs73bev9q0'||e.RENDER_GIT_COMMIT!=='RECORDED_RELEASE_SHA'||e.NODE_ENV!=='production'||!gates.every(k=>e[k]==='false')||require('node:fs').existsSync('.env'))throw Error('target');
const journal=require('./dist/services/privacyRecoveryConfiguration').configuredPrivacyRecovery();
const state=await journal.ready();const pass=journal.scope==='speedy-privacy-production-epoch-0001'&&state.enrollmentHash===e.PRIVACY_RECOVERY_ENROLLMENT_HASH&&state.head.sequence===1&&state.cases.size===0&&!state.sealed&&!state.checkpoint;
console.log(JSON.stringify({check:'SPEEDY_RECOVERY_APP_READONLY',enrollmentMatches:state.enrollmentHash===e.PRIVACY_RECOVERY_ENROLLMENT_HASH,headSequence:state.head.sequence,caseCount:state.cases.size,pass}));process.exitCode=pass?0:1;
})().catch(()=>{console.log(JSON.stringify({check:'SPEEDY_RECOVERY_APP_READONLY',result:'STOP_TARGET_CONFIGURATION_OR_HISTORY'}));process.exitCode=1;});
SPEEDY_RECOVERY_APP_READONLY
```

Expected initial result: matches true, sequence 1, cases 0, pass true. A different
head is a stop for investigation, not a reset instruction. This verifies current
  production-prefix LIST/GET and authenticates the new deployment-Shell environment's
  dedicated key; it is not an inspection of the application's live memory. It does not
prove a runtime append/negative-policy denial or actual customer fulfillment.
Reuse completed synthetic allowed/denied/conditional-write evidence and authenticated
policy read-back; do not attempt a denied live production PUT/DELETE as a test.
Remove the temporary operator enrollment grant/session, verify targeted absence,
preserve policies/credentials and all four false gates. No CI credential copies
are needed or re-created. Record actual hashes/deploy IDs only after execution.

### 4. Ordered offline operator-reconciliation procedure

This is the incident/operator acceptance runbook; steps requiring a production
wrapper are explicitly **BLOCKED**, not commands to improvise today. The existing
five synthetic cloud recovery tests prove library behavior, not production authority.

1. **Declare recovery hold (Robert + incident engineer).** Keep public API traffic,
   staff mutation access and every writer/worker/scheduled job disconnected from
   the restored DB, including ordering and the retention cron. Privacy gates false
   alone are insufficient: normal ordering can recreate an identity if a marker was
   lost. Isolate the restored target/network and identify every connection before
   any application starts. Suspension/restore changes need incident authorization;
   none is performed now. Never restore S3 or its external pins alongside PostgreSQL.
2. **Verify target and schema (engineer).** Record exact approved restored resource,
   hostname/name/role and restore point privately, not merely the old production
   name. Validate migrations, columns and the four enabled protection triggers
   before write access. A schema discrepancy stops; only a separately reviewed
   migration plan may resolve it. Do not run test seed/reset tools or production
   app startup imports; no connection to ordering staging/SMS DB.
3. **Verify independent authority (operator).** With unchanged stable digest and
   external owner/bucket/region/active scope/enrollment hash, read current S3 entries
   using expected owner and normal current reads. Authenticate complete contiguous
   history, the initial pin, latest head and successor coverage if applicable.
   Pending INTENT, unfinished CHECKPOINT/CASE/COVERED, sealed predecessor, gaps,
   changed HMAC, permission/timeout, stale head, suspected policy bypass or uncertain
   write keeps the system offline. Never pick an old VersionId or DB head as truth.
4. **Dry-run complete coverage (BLOCKED on guarded production tooling).** Match all
   restored requests/markers/decisions to the latest authenticated case set. Check
   newer DB status/version/updatedAt, later cancellation/HOLD, external retain/review
   dates, financial holds, marker review, ownership/source/order scope and financial
   evidence. Unknown DB requests, missing scoped transactions/receipts, conflicting
   owners or changed financial hashes stop, not auto-import or erase. A minimized
   decision journal cannot recreate a missing receipt/transaction; recover verified
   financial evidence through the authorized recovery path first. Preserve newer
   decisions; never substitute fresh deadlines or blanket six-year personal retention.
5. **Apply once offline (BLOCKED on exact-target wrapper/authorization).** Reuse the
   tested reconciliation algorithm with the shared privacy advisory lock and one
   bounded transaction (existing 15-second limit). Handle non-erasure cancellations/
   holds without erasing. For a recorded erasure, use the existing scoped preview/
   `eraseScoped` after verifying ownership/evidence, then restore historical request,
   marker, revocations and external-outcome digests. Never pre-import terminal flags
   then call `fulfill`: its completed-request early return would skip restored-data
   erasure. Preserve created/due/erased/completed/closed/audit-review/marker-review
   dates and justified financial expiry/holds exactly. Recheck unchanged current
   journal head before DB commit; any discrepancy rolls back all DB changes.
6. **Verify without customer output (engineer/operator).** Require scoped replay
   counts, zero unresolved cases, preserved financial amounts/item descriptions/
   quantities/recognized receipt-charge evidence, credential revocation/markers and
   four guards; compare unaffected records privately with in-process digests/counts,
   not exports or customer rows. No GET loyalty, real purchase, code or delivery
   probe. Demonstrate idempotent dry-run/no work left, not repeated blind deletion.
   Recheck head remains current. The wrapper must record trafficMayReopen=false.
7. **Review external copies and reopening (Robert).** Historical journal task digests
   are not current provider-erasure proof. Review actual external-copy/financial hold
   outcomes and any newer decisions before reopening. Record reason and next review
   for extended need; original 24-month anchors remain review dates, not automatic
   deletion/minimums. Only Robert's explicit reviewed reopening decision releases
   ordinary traffic/writers. Customer/privacy gates are a distinct approval and
   remain false throughout this package. Do not claim restored production verified
   merely because the schema/count checks passed.

**Unfinished-operation resolution is not implemented:** because INTENT, DB commit
and COMMIT are separate, any crash/uncertainty needs attributable evidence of the
specific operation's actual DB outcome and latest holds/cancellations. The present
library deliberately stops; no automatic ABORT/COMMIT repair protocol or production
resolution CLI exists. Preserve both sides and sanitize incident evidence, keep
operations offline, and prepare a narrowly reviewed forward repair with synthetic
regressions. Never mark committed by guess, trim the suffix, reseal from an old DB,
force enrollment or repeatedly retry an unresolved operation.

**Review/minimization maintenance:** existing SEAL → CHECKPOINT/CASE/COVERED and
`verifyRecoverySuccessor` libraries require an exact state-bound reviewed plan,
same key, independent coverage and external successor pin before any predecessor
retirement. There is no production maintenance CLI. The bucket still denies ALL
production deletion; actual retired-history removal needs a separately reviewed
retired-prefix-only exception/operator manifest, never active-prefix delete rights.
Do not grant it during deployment/enrollment. Do not equate a 24-month review with
automatic purge or indefinite retention. Keep justified protection while verified
restoration/unresolved-case risk remains. Financial originals stay outside journal
minimization; paper receipts were not scanned/imported and TurboTax is tax filing.

### 5. Stop and rollback boundaries

- **Before enrollment / no privacy state:** on build/start/migration/health/config
  failure, stop further rollout. The current healthy privacy-capable `007cba9`
  application is the recovery target, not pre-security/pre-privacy code. Use it
  only after fresh read-only evidence confirms no real privacy state, no unknown
  journal operation and all gates false. No DB down migration, table/trigger drop,
  digest rotation, S3 change or failed-migration mark-success is permitted.
- **After GENESIS but before real activity:** preserve the entry, hash/key and all
  external pins even if the API code must roll back. Returning to `007cba9` is only
  a temporary gates-off fallback after proving all indicators zero and history is
  exactly the expected authenticated enrollment with no in-flight operation. Older
  code cannot maintain the journal; do not activate it. Do not delete GENESIS to
  pretend enrollment never occurred; repair/redeploy the reviewed recovery source.
- **Any real privacy activity, pending operation or ambiguity:** no rollback to
  recovery-unaware `007cba9`/`4ac2ba3` or pre-privacy/security versions. Keep recovery-
  aware code stopped/gates-off as appropriate and use a reviewed forward fix.
  Preserve revocation/markers/deadlines/triggers/financial evidence. A DB restore
  is not a code rollback and must follow the complete offline procedure above.
- Render artifact rollback reuses the target deploy's environment values and may
  therefore load older pins/secrets/gates. Prefer a reviewed same-source normal
  deployment with preserved current configuration; if artifact rollback is used,
  explicitly read back all pins/gates/key-presence/continuity before traffic. It
  never reverses database/S3 effects. Keep Auto-Deploy Off regardless of method.

Current official Render references read October 29:
[manual specific-commit deploy and build/pre-deploy/start sequence](https://render.com/docs/deploys),
[health readiness](https://render.com/docs/health-checks),
[rollback configuration boundaries](https://render.com/docs/rollbacks).
No arbitrary downtime, backup/log retention or provider-period promise is added.

### 6. Finite release handoff / unresolved prerequisites

1. **Technical, next:** implement/review guarded production enrollment + read-only
   preflight/dry-run and exact-target offline reconciliation wrappers, plus a reviewed
   unfinished-operation resolution path before real privacy use. Test guards with
   synthetic fixtures/controlled failures, reuse business logic and passing cloud
   evidence. No repeat AWS writes/inventory/clone is required for that source work.
2. **Release review:** integrate current main without changing executable scope,
   new PR/required CI and actual release SHA. Step A approval can cover API-only
   gates-off deployment; B remains blocked by tooling, actual MFA operator identity,
   fresh baseline/prefix and durable external pin handling. No enrollment hash or
   production baseline is asserted in advance. No new business retention approval.
3. **Separate B execution:** once prerequisites pass, explicitly approve one empty-
   baseline enrollment, private external pins, normal same-SHA API config-load and
   read-only restricted-app verification, temporary operator access removal. If state
   is nonempty, stop for the coverage requirement instead; no automatic import.
4. **Publication/activation prerequisites:** close only genuinely pending provider/
   external-copy facts with supported caveats; finalize unpublished privacy,
   account-deletion and support pages, then separately authorize publication matching
   deployed behavior, with actual publication date. Home is preserved. Configure
   the verified public privacy URL in iOS/ASC; unavailable-policy fallback is not
   release-ready. No invented provider retention or customer-data-location claims.
5. **Controlled customer-flow approval:** verified channel + initiation, fulfillment
   still off initially; exercise in-app source ownership/challenge/request/status/
   cancellation with explicit owner-only delivery consent. Preserve successful
   isolated SMS and owner email/Junk results, but they do not prove in-app flow or
   Inbox placement. Fulfillment/external outcomes need separate safeguarded approval
   after recovery/operator readiness; no real customer is a test fixture.
6. **Apple:** case **103005572330** remains unresolved. Do not conceal regulated
   products. Reuse completed physical iPad/permission-fallback and metadata/screenshot
   evidence; only changed/live functionality needs further targeted checks. Finalize
   truthful privacy answers/reviewer access/URLs and metadata against actual behavior.
   After eligibility and launch-critical gates are resolved, separately authorize
   final signed archive/validation/upload/submission. No archive/upload is authorized
   here; Android remains deferred. Keep the single iOS release checklist authoritative.

**Preparation verification:** 33/33 focused documentation/command assertions pass,
including 14 mocked command cases: exact-target/revision/gate stops, read-only GET
sequence/no retries, network/cache failures, missing/invalid history, dotenv stop,
redaction and read-only nine-indicator baseline SQL structure. These checks make
zero network/AWS/database calls and do not claim production command execution.
Public-policy file unchanged; only the five named backend/iOS handoff files changed.
Dispatcher-help review passes (zero implementation files changed) and whitespace
checks pass. No application suite/build/simulator/cloud inventory/test/cleanup was
rerun. Existing source CI/cloud evidence above remains the applicable evidence.

## Protocol and the current head

`src/services/privacyRecoveryS3.ts` implements the existing `ProtectedDecisionStore`
interface using the official `@aws-sdk/client-s3`, pinned in the lockfile. There is
one JSON object for each authenticated journal entry:
`production/epoch-0001/0000000000000001.json`, then `...0002.json`, etc. Keys contain
only sequence numbers. Existing minimized payload/HMAC/GENESIS/INTENT/COMMIT remain
compatible; explicit empty-baseline enrollment is unchanged. Signed SEAL and
CHECKPOINT/CASE/COVERED entries add reviewed successor coverage described below.

1. Read the **current** strongly consistent ordered S3 listing; get the entries,
   validate contiguous sequence/previous hashes and the pinned enrollment hash.
   `PrivacyRecoveryJournal.ready()` still authenticates the entire chain and
   rejects unfinished operations. No historical VersionId, DB-provided head or
   mutable local checkpoint is used.
2. Before append, verify the enrollment and expected predecessor; write exactly
   the next sequence key with `IfNoneMatch: '*'`. One PUT decides the winner.
   Another writer cannot replace that entry; 412/409 is resolved by comparing the
   exact recorded object. Only an identical operation is idempotent.
3. SDK attempts are one. On uncertain PUT outcomes, perform one read-back; accept
   only identical recorded content. An absent/unreadable result remains uncertain,
   because an in-flight write may arrive later. Do not resend/advance automatically.
   Exceptions contain fixed codes, never provider messages, response bodies or keys.
4. No separate head-object write exists. INTENT and COMMIT remain **separate**
   entries surrounding the database commit. Failure/crash between any of them
   leaves an unfinished operation for reviewed operator resolution. S3 provides
   no transaction across those objects or PostgreSQL, and none is assumed.
5. LIST pagination is not a multi-object snapshot. Under the append-only policies,
   ordered pages form an immutable prefix. An exact successor LIST detects an
   append during reading and stops for a fresh attempt. A process also rejects a
   head below one it already observed. No cached head is used after restart.
   All lists use the same permitted prefix, including successor probes; a 403
   missing-key response is never mistaken for absence under prefix-limited IAM.

### Why PostgreSQL restore cannot roll this head back

The enrolled bucket owner/name/region/prefix/scope and first-entry hash are retained in
protected configuration **outside PostgreSQL**. S3 stores the authoritative current
objects outside the database rollback boundary. Runtime and ordinary maintenance
principals cannot delete active entries, create delete markers, overwrite entries,
read old versions through the application or change those policies. These enforced
conditions, current AWS reads and the authenticated chain establish the head under
the stated access model. A PostgreSQL restore changes none of them.

**Versioning alone is not completeness or rollback proof.** A delete marker allows
an `If-None-Match` write to reuse a key, which is why active-prefix delete rights are
denied. Missing middle entries/tampering are detected; an entirely missing active
prefix fails enrollment. A fresh process cannot cryptographically detect a coherent
valid suffix removed by an administrator who first bypassed the delete/policy
controls. That stronger administrator-compromise guarantee is not provided by this
one-bucket design. Never restore/roll back this bucket or its pinned configuration
alongside PostgreSQL. Suspected policy bypass keeps traffic/processing stopped for
independent incident review; do not pick an older version and call it current.

AWS documents [strong consistency](https://aws.amazon.com/s3/consistency/),
[conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html),
[policy enforcement](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html),
and [ordered general-purpose listings](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html).

## One proposed resource and access boundary

| Field | Proposed value / exact review requirement |
| --- | --- |
| Bucket | `speedy-sweeties-privacy-decisions-080413009273`, owner `080413009273`; owner-confirmed, authenticated read-back pending |
| Region/type | Canada (Central), `ca-central-1`, general purpose, S3 Standard |
| Ownership | Bucket owner enforced; ACLs disabled |
| Public access | All four Block Public Access controls ON at bucket; preserve account-level blocking |
| Encryption | Explicit default SSE-S3/AES256; each adapter PUT also requests AES256; no paid KMS key proposed |
| Versioning | Enabled; no automatic current/noncurrent expiration or delete-marker lifecycle |
| Object Lock | Disabled; no minimum/irreversible retention period proposed |
| Other features | No website/CORS/public URLs, replication, transfer acceleration, access points, event integrations, new log bucket or jobs |
| Active scope | `production/epoch-0001/`, scope `speedy-privacy-production-epoch-0001`; exact enrollment hash retained separately from DB, not yet enrolled |
| Cloud test scope | `verification/recovery-integration-20261028/` only, synthetic journal/successor/race children and dedicated synthetic digest key |

Review templates beside this document:

- `privacy-s3-bucket-policy.json`: TLS, create-only/encrypted writes, no active
  production-object/version deletion, no trust-control changes by runtime/operator.
- `privacy-s3-application-policy.json`: current GET, exact-prefix LIST, conditional
  PUT; explicit deny of enrollment key, deletes, version reads and configuration.
- `privacy-s3-operator-policy.json`: inspect current/version history/configuration;
  initial GENESIS PUT only; synthetic-prefix writes/version cleanup. No active
  production deletion or trust-policy changes. It remains unattached; any future
  operator execution context requires separately reviewed, MFA-backed access.

The three existing templates now use the confirmed account/bucket and IAM-user ARN.
Their original access restrictions are preserved. They assume no broader grants;
inspect permission boundaries, session policies and group/role attachments too.
Validate actual policies with IAM Access Analyzer and controlled negative tests.
Identity policies grant access; bucket policies impose the denies. No assumption
that a mocked 403 proves the real AWS policies are installed.

### Credential handling

Runtime source explicitly uses only the existing IAM-user environment credentials
on Hobby. Generic operator/test clients still permit explicitly supplied clients or
an existing authorized operator session; that is not an application fallback. The
runtime has no operator delete permission. No credential is read on module import.

Future secure runtime configuration must pin the reviewed bucket, 12-digit owner,
prefix, scope and enrollment hash separately from DB backups, plus the existing
stable privacy digest key. The existing digest secret remains securely retained;
do not copy it into S3. AWS credentials/session tokens belong only in the approved
secret facility/Render private environment, never commands, repository files,
diagnostic dumps, browser URLs or chat. Standard SDK names, if an environment
credential provider is selected, are `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
and (for temporary credentials) `AWS_SESSION_TOKEN`. No values are requested here.
The exact runtime setting names/wiring are implemented above; saved/running values
and AWS access remain unverified until authenticated checks and approved execution.

The client fixes Canada Central's HTTPS endpoint, disables endpoint-environment
overrides and cross-region redirects, and uses `maxAttempts: 1`. Every call sends
ExpectedBucketOwner. Full reads have a four-second deadline, eight GETs maximum in
flight, 256 KiB/entry, 16 MiB/history and 10,000 entries maximum. Limits stop work;
they never delete/compact anything. Controlled cloud latency/capacity checks must
fit the existing 15-second DB transaction before production use. Existing full-
history semantics incur GET/transfer costs as the journal grows; no unmeasured
production performance claim is made.

## Retention, operator maintenance and privacy wording

The approved 30-calendar-day normal completion, December 31 fiscal year, generally
six years after the end of the last related tax year for necessary financial
evidence, and both 24-month **review** anchors remain unchanged. S3 decision records
are restricted personal information (identifiers/hashes), not anonymized records or
receipt backups. Their purpose is to preserve verified decisions, ownership, dates,
holds and anti-reactivation during recovery. No customer contact, OTP, raw status
secret, receipt original, actor notes or provider credential is added to the journal.

Review need before those dates where appropriate; remove unnecessary information
once no justified need remains. Record any extension's reason/next review date.
Preserve necessary protection while verified restoration/unresolved-case risk
remains. No lifecycle rule translates a review date into automatic deletion.

Deleting an active chain entry breaks completeness; the application has no delete
permission. `privacyRecoveryMaintenance.ts` now implements offline minimization:

1. Review every latest case against its exact authenticated state digest. Each
   retained case has a documented justification digest and next review date; original
   due/closure/first-review/financial dates remain unchanged. Removing a case needs
   explicit no-justified-need, resolved restoration/unresolved-case risk, independent
   financial-evidence protection and resolved external-hold attestations. Active
   requests/HOLDs and unexpired external holds cannot be omitted. No 24-month minimum
   or automatic expiry is inferred; reviewed no-need removal may occur earlier.
2. Atomically append a signed SEAL binding the exact source head, state count/digest,
   reviewed plan and target scope. Pending decisions stop sealing; racing decisions
   lose the existing conditional-write race and roll back. A sealed scope cannot
   continue normal privacy work. A failed seal/copy never automatically unseals it.
3. Write a distinct format-2 CHECKPOINT, one minimized CASE per retained state, then
   COVERED. This explicitly covers nonempty history; GENESIS is never reused for it.
   Interrupted copying fails closed; retrying the same sealed plan is idempotent.
   The target authenticates counts/digests and original dates independently after
   retirement. Removed IDs/raw review reasons are not copied; only bounded HMAC
   coverage evidence remains. Subsequent decisions preserve separate review metadata.
4. Verify the complete successor against the source seal before externally pinning
   the new scope/enrollment hash. `authorizeRetiredHistoryRemoval` requires that pin
   and offline confirmation. `privacyRecoveryRetirement.ts` additionally validates
   the actual active production configuration and complete exact retired-version
   inventory before operator-only removal. It rejects active/unknown targets, missing
   versions/delete markers, and unverified coverage; it stops on partial removal,
   reports incomplete cleanup and does not retry. The successor remains readable.

These functions are not HTTP routes, jobs or startup hooks. Actual retirement still
needs an authorized operator identity and a reviewed **exact retired-prefix-only**
exception to the bucket's current deletion deny. No such exception exists or was
changed here. Record the verified permit/version inventory privately before removal;
an interrupted removal requires operator review of that remaining manifest. Do not
blindly rerun incomplete-source verification. Reconcile any older DB-only closed
case against the reviewed minimization plan; unknown restored decisions fail closed.
Removing journal history does not authorize removal of required financial records
or real DB/request copies. Restore traffic stays offline until reconciliation and
external-copy verification; a maintenance pass never itself authorizes reopening.

Before activation/publication, review applicable AWS terms/DPA, account/support/
access/log arrangements and actual removal process. Proposed policy addition, only
after verified deployment: AWS S3 stores minimized privacy-decision records for
recovery/anti-reactivation in Canada Central; access and review/removal are limited
to those purposes. Do not claim all Speedy Sweeties processing is Canada-only:
Render, operators, support/legal obligations and other providers have their own
locations. AWS [privacy information](https://aws.amazon.com/compliance/data-privacy-faq/)
describes region choice; it does not establish this account's operational facts.
Keep the website unpublished and current policy caveats until these facts match.

## Current official pricing and explicit estimate

Public AWS pricing retrieved October 28, 2026, without account access. USD, before
tax/FX; no free credits assumed. Regional S3 offer publication
`2026-10-15T17:35:40Z`, effective October 1, 2026; transfer offer publication
`2026-09-16T13:22:08Z`, effective June 1, 2026:

| Item | Canada Central rate | Official offer SKU |
| --- | --- | --- |
| S3 Standard first 50 TiB | $0.025/GB-month | `9MDYGCA9S4SXXTJF` |
| PUT/COPY/POST/LIST | $0.0055/1,000 | `8EZXHUYH7B92R35H` |
| GET/other tier-2 | $0.00044/1,000 | `56GRD53C8EEUF5SE` |
| Internet outbound, first paid 10 TiB | $0.09/GB beyond applicable global free allowance | `CXWFSAS9ETSMBH2Y` |

Sources: [S3 pricing](https://aws.amazon.com/s3/pricing/),
[official Canada Central S3 offer JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ca-central-1/index.json),
[official Canada Central transfer JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/current/ca-central-1/index.json).
AWS's [transfer guidance](https://repost.aws/knowledge-center/s3-data-transfer-costs)
describes the shared 100 GB/month internet-out allowance; whether
this account has any remaining allowance is unverified. Use the paid rate below.
SSE-S3 is [included without an added encryption charge](https://docs.aws.amazon.com/AmazonS3/latest/userguide/serv-side-encryption.html).

Illustrative workload, **not observed customer volume**: 20 requests/month, average
10 recorded transitions each including holds/cancellations/operator outcomes,
400 new INTENT/COMMIT objects; 1,000 existing entries at month start, 1,200 average,
1,400 at month end; average 4 KiB/object. Assume 300 full reads, two LIST pages per
read, plus successor probes and predecessor/enrollment reads for 400 appends:

- PUT: 400 -> $0.00220; LIST: 1,300 -> $0.00715 (600 full-list pages,
  300 read-successor probes, 400 append-successor probes).
- GET upper estimate: 360,800 -> $0.15875, including predecessor/enrollment reads.
- Storage: 1,400 current versions plus 10% extra bytes for reviewed exceptional
  noncurrent versions, approximately 0.0059 GB -> $0.00015/month. Normal immutable
  appends create one version/key and no superseded versions; all existing versions
  remain billable until reviewed removal. This is no 24-month retention forecast.
- Transfer out: budget 1.42 GB including entry bodies/listing metadata -> $0.12780
  with no allowance credited. Upload into S3 has no data-transfer-in charge.
- Total approximately **US$0.30/month** under these assumptions (about $0.17 if all
  transfer falls within an available allowance). No minimum charge/spend approval.

Costs scale with retained entries, reads, payload sizes, restarts and exceptions.
No KMS/replication/CloudTrail data events/extra log service/support plan is included
or provisioned. Render's own transfer allowances/billing are not verified by AWS
pricing. Recalculate using actual usage before requesting provisioning approval.

## Exact bounded cloud verification — live synthetic PASS; cleanup complete

Existing AWS account/bucket/user setup is recorded above; do not repeat provisioning
or create a new key/operator role. Configuration inventory is complete; execution
is covered by Robert's explicit approval of the complete package and US$0.10 AWS
budget before tax/FX. No repeat approval is needed for that same scope.

### October 29 live result — sanitized provider/CI evidence

- [Run 40878909548](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40878909548)
  completed SUCCESS, `workflow_dispatch`, attempt **1**, exact review head
  `5e0791d4bc217252aa37425d32340811a3abe8b1`. Only documentation differs from tested
  cleanup/code `a692b0d`. No rerun or second dispatch was requested by the agent.
  Job `123464857969` completed all steps, including container shutdown.
- History also contains earlier dispatch
  [40878666189](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40878666189),
  created 09:04:44 Toronto, SKIPPED at 09:04:47, attempt 1. Its synthetic-cloud job
  `123464061027` is skipped with **zero steps**. Thus two dispatch records exist,
  but only one executed cloud job; do not claim a single dispatch across history
  or invent its input/reason. The earlier skipped job did not execute AWS test code.
- Created October 29 at 09:06:22 Toronto; job ran 09:08:43–09:10:17 and run completed
  09:10:18 Toronto (UTC 13:06:22 / 13:08:43–13:10:17 / 13:10:18). Same-session
  cleanup requested immediately; conservative 24-hour cleanup deadline is
  **October 30, 09:06:22 Toronto**, not a retention rule for customer records.
- Actual AWS app-account/identity guards passed; real SDK journal writes/reads and
  permission probes succeeded only under the reserved synthetic run prefix. Current
  GET succeeded; out-of-approved-test-prefix GET, old-version GET, DELETE and
  unconditional PUT were asserted HTTP 403; conditional overwrite asserted 412.
  Real concurrent writers produced one winner; deliberately lost post-acceptance
  acknowledgement was recovered; restart passed. No production object was targeted.
- Actual serial PostgreSQL 18 dump/restore suite: tests **5**, pass **5**, fail **0**,
  skipped **0**, duration **43325.988659 ms**. Includes verified nonempty successor
  coverage, both old snapshots, original deadlines/review dates, later holds/
  cancellations, financial evidence/charge facts, anti-reactivation/access revocation,
  unchanged unrelated fixtures and unfinished-operation stops. Selected missing/
  interrupted responses and predecessor unavailability were controlled injections
  over real S3, not actual AWS object deletion/outage. This is synthetic cloud
  verification, NOT production enrollment/recovery or a new production restore.
- Sanitized `SPEEDY_S3_CLOUD_PROBES`: allowedDeniedPassed=true,
  conditionalRacePassed=true, acceptedWriteResolutionPassed=true, restartPassed=true;
  fullReadMs=438 (<4000); instrumented transport requestP95Ms=249, maxRequestMs=253,
  cloudCalls=44, puts=5. Those counters exclude the DB-recovery phase and direct
  permission probes; they are **not** total billed requests. Existing aggregate
  request/put/payload bounds did not fail. Actual invoice/cost is not yet observed;
  no invented exact charge or assertion of a verified AWS billing cap.
- Only sanitized summaries were preserved; no keys/key IDs, signing headers,
  journal/object bodies, phone numbers, OTPs or raw provider responses are stored
  in this handoff. Delivery was mocked; production gates/settings unchanged.
- **Cleanup COMPLETE, October 29:** Robert returned authenticated CloudShell output
  `{"check":"SPEEDY_S3_SYNTHETIC_CLEANUP","deletedVersions":37,"emptyVersionInventory":true,"result":"CLEANUP_CONFIRMED"}`.
  Pinned helper `a692b0d` / SHA256
  `c786dee4becd82f2c4a0a15e3b07623cca845c1de663a41961e9bd190f590bc4`
  validated account/non-app identity, exact bucket/prefix and complete known-key
  manifest before removing the 37 version/marker entries, then verified no remaining
  versions/markers or truncation. This is **owner-supplied authenticated cleanup
  evidence**, not an agent-run AWS delete. Exact cleanup timestamp was not supplied;
  completion was reported on October 29, before the conservative deadline above.
- Robert subsequently replied `done` to the explicit app inline-grant removal,
  conditional operator cleanup-grant removal and GitHub test-environment deletion
  instructions. Record temporary IAM grant cleanup as **owner-confirmed**; no
  independent IAM API read-back was available. Whether an operator cleanup grant
  was ever added was not separately reported; do not invent that history. Permanent
  app policy/key and unattached permanent operator policy were to remain unchanged.
- Independent unauthenticated GitHub read-back: repository HTTP 200/public=true;
  exact environment `privacy-s3-verification` HTTP **404** after its earlier 200.
  The test environment is removed, including its two active environment-secret
  entries. No secret value was retrieved; no claim about GitHub backup erasure.
- The executed CI job/containers are terminal and the synthetic version inventory
  is empty. No new paid resource or ongoing test compute/storage remains; request
  charges/invoice are not independently reconciled. No further test, cleanup rerun,
  production action, website publication or Apple upload is authorized by this result.
- NEXT RELEASE ACTION at closeout (now prepared in the production package above):
  gated production recovery rollout, enrollment/external pins and offline operator
  handoff. Its next source prerequisite is guarded production operator wrappers;
  the current source is not deployed/enrolled.
  production permission/runtime/restore operation, activation and in-app verification
  remain separate. Keep all four gates false/Auto-Deploy Off. No new restore clone,
  repeat provider inventory, retention decision or broad audit is needed here.

### Preparation evidence and owner setup

- Cleanup source `a692b0da41fe3c0d4a0bd8d4e6e3f13a349d16fa` replaces all standalone
  cleanup stdin JSON with closed 0600 files/0700 directories, finally removal and
  sanitized failures. Account/operator/prefix/manifest/version guards are unchanged.
  Five focused serial groups PASS, including actual child-process cleanup, versions
  and delete markers, rejected targets, timeouts/interruption, partial preparation,
  private-response redaction and partial deletion stop without retry.
- Both Node 24.22.1 Linux CI jobs PASS at that exact source in
  [CI 40811316279](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40811316279).
  No Mac application build, DB restore, simulator or dependency installation.
- Render monitoring independently read API `srv-d7ntlnpkh4rs73bev9q0`, dispatcher
  `srv-d7m4hgpkh4rs73agsfc0` and cron `crn-da1s3vnqj5pc73d2c63g`:
  `autoDeploy=no`, `autoDeployTrigger=off`, checked again immediately before merge.
  Linked ordering staging and isolated test services also read Off; none changed.
- [Workflow-only PR 98](https://github.com/speedysweeties-ca/speedy-sweeties-backend/pull/98)
  merged at `ac1a69b13211b8612213ade951a3db15b5142a90`. One added file only,
  `.github/workflows/privacy-s3-cloud.yml`, exact reviewed blob
  `5c32bdb415c5a879639eb55726bd29b029d4adf5`; no source/dependency/migration changes.
  Both jobs PASS in PR [CI 40811599544](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40811599544)
  and normal push [CI 40811582646](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40811582646).
  Branch protection/mergeability checks respected. No Render deployment triggered.
  This main registration SHA is not evidence of a changed running production SHA.
- Earlier manual-run baseline query returned no dispatch runs. Robert subsequently
  supplied `ready` and confirmed both environment secrets saved using the existing
  application pair, privately copied from Render, with no Render change/key rotation.
  This is owner-reported credential handling; the agent retrieved no secret.
- Independent public GitHub metadata read-back (no token/credential read):
  environment `privacy-s3-verification`, sole reviewer `speedysweeties-ca`,
  prevent_self_review=false, can_admins_bypass=false, custom branch policies=true,
  exactly one allowed Branch `review/customer-account-deletion`. Connector lacks
  dispatch/IAM/secret-management actions; Robert performed the one dashboard dispatch
  and supplied its URL. These were execution steps under his existing approval.
- The owner setup/dispatch/cleanup actions below are now completed evidence, **not**
  instructions to repeat them.
  Provider configuration inventory is already closed and must not be rerun.
  Actual verification-prefix application access is now passed, not pending/failed;
  production-prefix/runtime configuration and production enrollment remain untested.

### Private dashboard setup — owner action, no secret disclosure

1. In AWS account `080413009273`, IAM → Users → `SpeedyPrivacyJournalApplication`
   → Permissions → Add permissions → Create inline policy → JSON. Paste exactly
   `docs/privacy-s3-verification-policy.json` at tested source `a692b0d`, name
   `SpeedyPrivacyJournalSyntheticVerification`. Preserve the original app policy;
   permanent operator policy stays unattached. No bucket-policy change.
2. GitHub repository Settings → Environments → `privacy-s3-verification`. Required
   reviewer `speedysweeties-ca`; Prevent self-review unchecked; administrator bypass
   disabled. Selected deployment branches/tags: Branch `review/customer-account-deletion`
   only. Add existing securely retained values through **Environment secrets**:
   `PRIVACY_TEST_AWS_ACCESS_KEY_ID`, `PRIVACY_TEST_AWS_SECRET_ACCESS_KEY`. No repository-
   wide secrets, workflow inputs, shell paste, credential retrieval or rotation.
3. Do not click Run workflow yet. Keep the authorized AWS owner CloudShell session
   available for immediate cleanup after the single run. Once setup is confirmed,
   choose the review branch (never main), `authorized=true`, click Run workflow once,
   then approve its environment gate. GitHub may call that gate Review deployments;
   it approves this synthetic CI job, not Render production deployment. Do not retry.

### Approved consolidated scope — preserved authorization

Robert approved one synthetic run and its complete cleanup in existing account
`080413009273`, bucket `speedy-sweeties-privacy-decisions-080413009273`, Canada
Central. Writes/removals are limited to `verification/recovery-integration-20261028/`.
Do not enroll or inspect production decision objects. No new AWS/Render resource,
account, key, role, plan upgrade, message or live AI call.

1. **Cleanup prerequisite before any cloud write:** correct only
   `scripts/privacyS3SyntheticCleanup.py`'s known `/dev/stdin` input incompatibility,
   reusing the tested closed 0600/private-directory JSON transport (or the smallest
   equivalent). Keep its exact account/operator/prefix/known-key/version safeguards
   and authorization. Run synthetic real-subprocess cleanup/error regressions and
   relevant CI, commit/push, and record the final tested revision. Do not run the
   cleanup mutation against AWS yet. Stop cloud execution if this prerequisite fails.
2. **Temporary app permission:** add an inline policy named
   `SpeedyPrivacyJournalSyntheticVerification` to existing IAM user
   `SpeedyPrivacyJournalApplication`, exactly `privacy-s3-verification-policy.json`:
   bucket `s3:ListBucket`/`s3:ListBucketVersions` only when `s3:prefix` matches
   `verification/recovery-integration-20261028/*`; object `s3:GetObject`/`s3:PutObject`
   only at `arn:aws:s3:::speedy-sweeties-privacy-decisions-080413009273/verification/recovery-integration-20261028/*`.
   Preserve the original application policy and every explicit deny. Existing
   bucket-wide create-only/SSE-S3 rules apply to these writes too. No app delete,
   version-body read, ACL/control-plane or new production-prefix grant.
3. **Private credential/environment setup:** in GitHub repository Settings →
   Environments, create/reuse `privacy-s3-verification`, allow only branch
   `review/customer-account-deletion`, require Robert's review, and disallow admin
   bypass. Permit the sole owner to approve their own dispatch if needed; do not
   enable an impossible sole-reviewer self-review restriction. Robert enters only
   his existing securely retained application key into environment secrets
   `PRIVACY_TEST_AWS_ACCESS_KEY_ID` and `PRIVACY_TEST_AWS_SECRET_ACCESS_KEY` through
   the private GitHub UI. No secret in chat, source, shell arguments, workflow
   inputs or logs. No Render credential retrieval, replacement or rotation. If no
   secure copy/protected environment is available, stop without cloud writes.
   **Risk disclosure:** this is the same identity/key, not an isolated new identity;
   its existing production-prefix grants remain. Prefix-guarded code and protected
   CI access constrain this test, but the temporary allow is not an overriding
   deny of those pre-existing grants. Remove the extra CI copy promptly.
4. **Manual registration only:** create/review/merge a PR containing only
   `.github/workflows/privacy-s3-cloud.yml` onto current `main`, respecting checks/
   branch protection. This specifically authorizes a workflow-registration merge,
   **not** the review branch's application/privacy/recovery source or migrations.
   Render Auto-Deploy must remain Off; no deployment or automatic trigger. Then
   dispatch the review branch once with `authorized=true`, record its exact tested
   SHA and allow Robert's environment review. At approval the public/default `main`
   lacked the workflow; PR 98 now registers it there. Do not dispatch `main`
   (it lacks the review test source) or rerun an uncertain/partially populated prefix.
5. **Run/budget:** one standard included Linux runner, one serial PostgreSQL 18
   worker, at most 15 minutes; no paid runner/capacity. Four gates false, delivery
   mocked, synthetic secrets/database only. Verify exact app/account, empty test
   version inventory, allowed/denied access, conditional/racing writes, uncertain
   response/restart, real synthetic restore/successor/financial/date/hold/unrelated
   protections and latency. The denied out-of-scope GET targets only the synthetic
   `verification/unapproved-run/` path, never production. Proposed **US$0.10 AWS test
   budget before tax/FX**, expected under $0.05; aggregate bounds 10,000 requests /
   150 attempted puts / 16-KiB objects plus cleanup within the stated allowance.
   This is a conservative cost estimate, not an AWS-enforced dollar cap. No other
   paid resource. Stop on unexpected identity, nonempty prefix, failure or budget
   limit; no automatic retry. Existing gates and production settings stay unchanged.
6. **Cleanup on success or failure, same session and within 24 hours:** use Robert's
   existing authorized non-application owner/CloudShell identity. The permanent
   `SpeedyPrivacyJournalOperatorPolicy` stays unattached; assume no operator role.
   If that existing identity needs a temporary cleanup grant, use inline
   `SpeedyPrivacyJournalSyntheticCleanup`, exactly
   `privacy-s3-verification-cleanup-policy.json`: bucket `s3:ListBucketVersions`
   only with exact prefix `verification/recovery-integration-20261028/`, and
   `s3:DeleteObject`/`s3:DeleteObjectVersion` only at the run's object ARN above.
   Verify the exact existing principal first; never grant cleanup to the app user
   or create a role. Validate the full synthetic key/version manifest before any
   removal; delete all known test object versions/delete markers and verify zero
   remaining versions. Stop and report unknown objects/partial failure, never widen
   the target. Preserve sanitized results before cleanup. Keep bucket/production
   objects and all permanent protections untouched.
7. **Remove temporary access:** remove both temporary inline policies (if added),
   delete both CI environment-secret entries and remove the dedicated test
   environment after its run completes. Verify only targeted temporary-access/
   secret-name absence, not a repeated configuration inventory. End the ephemeral
   runner; retain sanitized counts/status/timing evidence only. Do not claim GitHub
   backup erasure. Preserve Robert's original secure key copy and Render Save-only
   values. If cleanup is blocked, remove CI credential/access copies promptly and
   report the exact remaining synthetic versions/access; no unattended reruns.

This single recorded approval covers the prerequisite source correction, exact
temporary permissions/private CI credential copies, workflow-only registration
merge, one test and its narrowly scoped cleanup. It does **not** cover production
deployment, enrollment, restoration/customer changes, privacy activation, website
publication or Apple upload. No automatic rerun or scope expansion is authorized.

GitHub documents the [default-branch dispatch requirement](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
and [environment secret/reviewer/branch protections](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

### Existing operational sequence — under the approval and current status above

1. The owner-supplied authenticated configuration inventory is PASS; do not rerun
   it. Application access is untested, not failed. Complete the cleanup-helper
   private-file prerequisite above before any permitted cloud write.
2. Already approved: one synthetic run, expected AWS cost below **US$0.05**, bounded
   below **US$0.10** before tax under 10,000 requests, 150 immutable puts and 16-KiB
   synthetic object limits. At official rates above, the worst request/transfer
   allowance is approximately $0.055 + $0.014 plus negligible stored test versions.
   Use existing included CI capacity only; do not authorize extra runner spend.
3. Temporarily attach only `privacy-s3-verification-policy.json` to the existing app
   user. It adds GET/conditional PUT and prefix-limited LIST/ListVersions only under
   `verification/recovery-integration-20261028/`; the permanent explicit denies still
   prohibit deletes/version reads/control changes. Do not expand production access.
4. Prepare the private GitHub `privacy-s3-verification` environment, restrict it to
   the reviewed branch and require Robert's approval. Privately enter the existing
   application credential copy as `PRIVACY_TEST_AWS_ACCESS_KEY_ID` and
   `PRIVACY_TEST_AWS_SECRET_ACCESS_KEY`; never paste them into a workflow input/chat.
   No key creation/rotation or extraction into logs is authorized. If a secure
   existing copy is unavailable, stop for a private credential-access path.
5. `.github/workflows/privacy-s3-cloud.yml` is **workflow_dispatch only**, with an
   explicit authorization input. GitHub requires this new workflow to be registered
   on the [default branch before it can be dispatched](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow): registration requires a
   separately reviewed workflow-only merge, with Auto-Deploy Off. That registration
   is completed by PR 98 above; do not repeat it. Do not add a push/automatic trigger as a
   substitute. Then select the exact reviewed branch/revision and dispatch once
   with `authorized=true`; do not rerun an uncertain/partially populated prefix.
6. The job verifies STS account **and exact IAM user**, zero existing test versions,
   all four gates false and the guarded CI PostgreSQL identity before any write.
   It reuses the serial PostgreSQL 18 fixtures with delivery mocks: real S3-backed
   decisions, sealed successor coverage, both actual synthetic DB snapshots, later
   cancellation/hold, old credential revocation, required readable financial evidence
   and unrelated records. Missing/uncertain storage responses are injected at the
   transport boundary; no production DB, ordering/staging/SMS environment is used.
7. Actual credential probes require allowed current GET/PUT, denied out-of-test-prefix
   GET, old-version GET, DELETE and unconditional PUT, existing-key conditional 412,
   one winner in a real two-writer race, resolved accepted PUT with a deliberately
   lost response, restart and full-read latency. Existing four-second read and
   15-second DB transaction limits must hold; sanitized output records counts/times,
   never object bodies, access keys, signing headers, destinations or OTPs.
8. After success **or failure**, use Robert's existing authorized operator/CloudShell
   session and `scripts/privacyS3SyntheticCleanup.py --authorize recovery-integration-20261028`.
   It checks account/operator identity and every key/version first, deletes only
   that reserved verification prefix's known journal/successor/race objects and all
   versions/delete markers, and verifies an empty version inventory. It never
   deletes a bucket/production prefix, and stops immediately on errors. The app's
   explicit deletion deny remains intact. If the existing operator session lacks
   rights, `privacy-s3-verification-cleanup-policy.json` is the exact narrowly scoped
   temporary permission to review for that existing identity; no role is assumed.
9. Remove temporary verification/cleanup inline grants and CI credential
   copies, preserving the original Render key. Use only targeted IAM/CI absence
   checks, not a repeated completed inventory. Keep the existing private
   bucket; no new services/resources require teardown. Preserve sanitized evidence.
10. Before production use, review actual cloud results/provider facts and precise
    operator session, offline restore and production enrollment/cutover procedures.
    The app cannot write initial GENESIS. An authorized operator must explicitly
    validate the real decision baseline and enroll once using the stable digest
    key, then externally pin the observed first-entry hash. Missing/dirty history
    must never auto-enroll. Configuration, deployment, production enrollment and
    gate activation require separate approval; all four gates stay false here.

### Completed cleanup command — preserved evidence; do not rerun

The command below produced the owner-supplied `CLEANUP_CONFIRMED` result above.
Do not rerun it. Its original approved instructions were:

After the workflow is terminal, use Robert's existing authorized non-application
CloudShell session in account `080413009273`. This standalone, checksum-pinned
helper needs no downloaded dependencies or application key. It removes only known
synthetic versions/markers after validating their complete inventory. It was
downloaded with HTTP 200/checksum PASS but has not been executed against AWS.

```sh
python3 - <<'SPEEDY_SYNTHETIC_CLEANUP'
import hashlib, sys, urllib.request
url = "https://raw.githubusercontent.com/speedysweeties-ca/speedy-sweeties-backend/a692b0da41fe3c0d4a0bd8d4e6e3f13a349d16fa/scripts/privacyS3SyntheticCleanup.py"
try:
    code = urllib.request.urlopen(url, timeout=20).read()
    if hashlib.sha256(code).hexdigest() != "c786dee4becd82f2c4a0a15e3b07623cca845c1de663a41961e9bd190f590bc4":
        raise ValueError("checksum")
except Exception:
    print('{"check":"SPEEDY_S3_SYNTHETIC_CLEANUP","result":"STOP_DOWNLOAD_OR_CHECKSUM"}')
    raise SystemExit(1)
sys.argv = ["reviewed-synthetic-cleanup", "--authorize", "recovery-integration-20261028"]
exec(compile(code, "reviewed-synthetic-cleanup", "exec"), {"__name__": "__main__"})
SPEEDY_SYNTHETIC_CLEANUP
```

Return only its sanitized JSON. `CLEANUP_CONFIRMED` must include
`emptyVersionInventory=true`. Any stop/partial result requires review, no blind
rerun. Then delete only inline `SpeedyPrivacyJournalSyntheticVerification` from
the app user and `SpeedyPrivacyJournalSyntheticCleanup` if it was added to the
identified existing owner identity. Keep permanent policies and the original key.
After the workflow is terminal, delete GitHub environment `privacy-s3-verification`,
removing both test-secret entries and its protections; verify it is absent. Do not
delete other environments/secrets or the existing AWS bucket. Record targeted
absence/cleanup evidence; do not rerun the completed AWS configuration inventory.

### Earlier provisioning proposal — historical only, superseded above

1. Establish the existing AWS account's owner, 12-digit account ID, billing access,
   approved role/credential path and bucket-name availability without sharing
   credentials. Obtain authorization for the one bucket and stated costs; account
   creation, resources and spending are outside this preparation approval.
2. In S3 > Create bucket choose the proposed name, Canada Central/general purpose,
   owner enforced, all public blocks, versioning Enabled, SSE-S3; leave Object Lock,
   replication, website, acceleration, lifecycle and optional paid services off.
3. Substitute the established account/bucket in the three JSON templates. Review
   the operator MFA trust policy and all identity grants. Apply through a separate
   configuration authority; app/operator cannot change trust controls. Validate
   with Access Analyzer. Record only sanitized resource/configuration facts.
4. Read back location, public blocks, ownership, encryption, versioning, lifecycle,
   bucket and identity policies. Confirm no public access, replication or automatic
   deletion. Confirm the application cannot read other prefixes/version IDs,
   write GENESIS, overwrite, delete, set lifecycle or change bucket policy.
5. Use only `verification/<run-id>/`, a synthetic digest and dedicated bounded test
   permissions in that same bucket. Temporarily apply the production-style delete
   deny to that test prefix as well. Explicitly enroll a synthetic empty DB; retain
   its pinned GENESIS outside the DB. Use the official client/adapter and existing
   synthetic PostgreSQL fixture with mocked customer delivery. No production data.
6. Verify one conditional append, two racing writers (one winner), identical retry,
   restart from pinned config, current GET/LIST order, denied unconditional PUT,
   overwrite, delete/delete-version and out-of-prefix/version reads. Enforce a
   controlled aborted/uncertain response and an INTENT-only restart; it must remain
   blocked rather than resending. Reconcile both existing synthetic snapshots;
   assert the existing financial, date, cancellation/hold and unrelated-customer
   protections. Record SDK/AWS status codes/counts and configuration booleans only,
   never object bodies, signing headers, credentials or customer-like identifiers.
7. Measure full-read/transition latency and costs at reviewed synthetic scale,
   including restart; verify the four-second read and 15-second transaction limits.
   Check actual policy enforcement and IAM path separately from mocked results.
8. Remove the test-prefix deny only for authorized synthetic cleanup; operator
   deletes all that run's versions and delete markers, verifies an empty version
   listing, then removes temporary test permissions. Leave production prefix and
   policy intact; no automatic cleanup of real decisions.
9. Before production enrollment: complete/test successor coverage and reviewed
   minimization, account/provider/privacy facts, exact offline production target
   wiring, intended error/unfinished-operation recovery, secret continuity and
   release review. Confirm real privacy state is still empty; if it is not, stop
   for an explicit historical coverage plan. With processing/traffic appropriately
   controlled, an authorized operator runs existing empty-baseline enrollment once,
   records GENESIS/bucket/scope externally, then switches to the restricted app
   identity and active mode. No automatic bootstrap on missing S3 data.
10. Deployment, production enrollment and each activation/channel gate require
    their own concrete approval. Keep all four gates false and Auto-Deploy Off
    throughout this preparation and synthetic cloud verification proposal.

## Verification record

Final integration source `649c93884364277322bab21fec27885c708209ca` passes both
`validate`/`privacy-database` in
[CI 40803657852](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40803657852).
Node 24.22.1 / PostgreSQL 18: recovery 5/5 (including successor and unavailable
predecessor), privacy 22/22, backend 513 passes/5 DB-only skips/zero failures,
both timing DB checks and dispatcher 69/69. Local serial metadata/cleanup/cloud-budget guard tests,
type-only check and dispatcher-help review pass. No simulator, local DB restore,
application build, live AWS checker, cloud workflow, retirement or enrollment ran.
The earlier adapter-only evidence below remains valid historical evidence.

Tested source `5a222be5bb4e18c1afdeec9c025bd4a247b8c653` on the existing review
branch. Both `validate` and `privacy-database` passed under Node 24.22.1 in
[CI 40727353624](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40727353624).
The 11 new S3 cases passed, including actual official-SDK header serialization,
fixed endpoint/single attempt, empty LIST XML, races, uncertain acceptance/late
arrival, idempotence/restart, missing/tampered history, stale heads, permissions,
pagination and the explicit privileged-suffix-removal evidence limit.

The existing serial PostgreSQL 18 suite now uses this adapter with controlled S3
responses: 4/4 recovery tests (parent plus before-request, before-fulfillment and
storage-failure cases). Original dates, later holds/cancellations, financial guards,
missing financial evidence/newer external holds, old access revocation and unrelated
customers pass unchanged. Existing privacy/baseline/delivery suite: 22/22. Backend:
503 passes, 5 database-only skips, zero failures; separate timing-history DB checks
and dispatcher 69/69 pass. Local type-only/help/whitespace checks pass; no Mac
application build, DB suite or simulator duplicated Linux verification.

The prior `357a552`/`e998189` results are preserved. These controlled-response and
synthetic database results are **not AWS cloud or production verification**. Bucket
configuration, policy evaluation, account/credential path, live latency and actual
operator/enrollment execution remain unverified in AWS. Successor/wiring/retirement
source was completed later as described above; its cloud behavior remains unverified.
Subsequent documentation-only evidence commits reuse this exact tested source.

## Completed inventory command — preserved evidence; do not rerun

The command below produced Robert's owner-supplied authenticated PASS recorded
above. Preserve it for traceability, not as another next action. The test package
is now approved; the next action is private dashboard setup above. Its original instructions were:

Open the AWS console in account `080413009273` and open **CloudShell** using the
existing signed-in owner session. Do not enter the application access key or change
credentials. Copy this whole command once; return only its single sanitized JSON
line. It downloads the immutable revised checker and verifies its checksum before
executing its read-only operation allowlist with the corrected shared private-file
input path. The command does not rerun the legacy diagnostic. The public artifact
was independently downloaded with HTTP 200/checksum match; it has not been executed
against AWS.

```sh
python3 - <<'SPEEDY_AWS_READONLY'
import hashlib, sys, urllib.request
url = "https://raw.githubusercontent.com/speedysweeties-ca/speedy-sweeties-backend/0dc48786e82be413bb70cedac57bc35b26787040/scripts/privacyAwsReadOnly.py"
try:
    code = urllib.request.urlopen(url, timeout=20).read()
    if hashlib.sha256(code).hexdigest() != "46b73d9d2c1f423f303cb1e427e11467e23c2901d7a386ceec73550bb4a8ba95":
        raise ValueError("checksum")
except Exception:
    print('{"check":"SPEEDY_AWS_PRIVACY_READONLY","result":"STOP_CHECKER_DOWNLOAD_OR_CHECKSUM"}')
    raise SystemExit(1)
sys.argv = ["reviewed-aws-readonly"]
exec(compile(code, "reviewed-aws-readonly", "exec"), {"__name__": "__main__"})
SPEEDY_AWS_READONLY
```

Expected result is either `READBACK_PASS_LIVE_APPLICATION_ACCESS_UNVERIFIED` or a
sanitized `REVIEW_REQUIRED`/`STOP_*`. Denied/unavailable metadata stays unverified;
no setting is changed to make the check pass. This does not read S3 object bodies,
prove the saved Render key is loaded or authorize the prepared cloud-write workflow.
The command pins checker source `0dc48786e82be413bb70cedac57bc35b26787040`;
later documentation-only commits do not change the executable artifact.
