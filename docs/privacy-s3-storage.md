# S3 privacy decision store — integration handoff, 2026-10-28

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

## Exact bounded cloud verification — approved; private setup outstanding

Existing AWS account/bucket/user setup is recorded above; do not repeat provisioning
or create a new key/operator role. Configuration inventory is complete; execution
is covered by Robert's explicit approval of the complete package and US$0.10 AWS
budget before tax/FX. No repeat approval is needed for that same scope.

### Execution record — cleanup/registration complete, cloud run not started

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
- Manual-run baseline query returned no workflow_dispatch runs on the review branch.
  **Cloud test NOT RUN.** No S3 writes, cloud deletions or production enrollment.
  No test objects have been created by this execution; bucket/prefix emptiness and
  post-test cleanup are not claimed without their actual future checks.
- Connector access cannot manage AWS IAM or GitHub protected-environment secrets/
  workflow dispatch. Robert has the precise dashboard steps for the approved app
  inline policy and protected private credential copies. Their completion is
  **pending confirmation**, not assumed and not an application credential failure.
  No secret is requested in chat or extracted from Render. Do not dispatch until
  the owner confirms setup and the exact reviewed branch head is recorded.
- NEXT owner action: complete the private setup below and reply `ready` only, no
  secret/screenshot. The later single dispatch/environment review is an execution
  step under the existing approval, not a request for renewed business approval.
  If the UI is unavailable or the existing secure key copy is missing, stop and
  report that precise limitation; do not create/rotate keys or upgrade plans.

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

### Approved post-run cleanup command — do not run before the single test

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
