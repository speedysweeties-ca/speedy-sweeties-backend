# Proposed S3 privacy decision store — review handoff, 2026-10-28

Source preparation and synthetic testing only. No AWS account or resource was
created/accessed, credential retrieved, cloud verification run, or deployment made.
Preserve source `357a552`, its evidence `e998189`, and prior release approvals.
OpenAI identity/model review is closed and unchanged. Production remains `4ac2ba3`,
all four privacy gates false and Auto-Deploy Off. AWS is a proposed new processor.

## Protocol and the current head

`src/services/privacyRecoveryS3.ts` implements the existing `ProtectedDecisionStore`
interface using the official `@aws-sdk/client-s3`, pinned in the lockfile. There is
one JSON object for each authenticated journal entry:
`production/epoch-0001/0000000000000001.json`, then `...0002.json`, etc. Keys contain
only sequence numbers; existing minimized payload/HMAC/GENESIS/INTENT/COMMIT and
explicit empty-decision-baseline enrollment rules are unchanged.

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

The enrolled bucket owner/name/region/prefix/scope and GENESIS hash are retained in
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
| Bucket | `speedy-sweeties-privacy-decisions-<AWS_ACCOUNT_ID>`; actual owner/account and globally available name not yet established |
| Region/type | Canada (Central), `ca-central-1`, general purpose, S3 Standard |
| Ownership | Bucket owner enforced; ACLs disabled |
| Public access | All four Block Public Access controls ON at bucket; preserve account-level blocking |
| Encryption | Explicit default SSE-S3/AES256; each adapter PUT also requests AES256; no paid KMS key proposed |
| Versioning | Enabled; no automatic current/noncurrent expiration or delete-marker lifecycle |
| Object Lock | Disabled; no minimum/irreversible retention period proposed |
| Other features | No website/CORS/public URLs, replication, transfer acceleration, access points, event integrations, new log bucket or jobs |
| Active scope | `production/epoch-0001/`, scope `speedy-privacy-production-epoch-0001`; pinned GENESIS hash retained separately from DB |
| Cloud test scope | `verification/<reviewed-run-id>/`, synthetic data and dedicated synthetic digest key only |

Review templates beside this document:

- `privacy-s3-bucket-policy.json`: TLS, create-only/encrypted writes, no active
  production-object/version deletion, no trust-control changes by runtime/operator.
- `privacy-s3-application-policy.json`: current GET, exact-prefix LIST, conditional
  PUT; explicit deny of enrollment key, deletes, version reads and configuration.
- `privacy-s3-operator-policy.json`: inspect current/version history/configuration;
  initial GENESIS PUT only; synthetic-prefix writes/version cleanup. No active
  production deletion or trust-policy changes. Operator role requires MFA-backed
  short-lived access and is never assigned to the app.

Replace `REPLACE_BUCKET` / `REPLACE_ACCOUNT_ID` only after owner/account/name review.
These templates assume same-account identities with no broader attached grants;
inspect permission boundaries, session policies and group/role attachments too.
Validate actual policies with IAM Access Analyzer and controlled negative tests.
Identity policies grant access; bucket policies impose the denies. No assumption
that a mocked 403 proves the real AWS policies are installed.

### Credentials and configuration (proposed; not saved to Render)

The official SDK resolves credentials through its normal provider chain when an
explicitly constructed client sends a request. No credential is read at module
import and no adapter is wired into startup/routes by this change. Prefer a
dedicated short-lived role/session if a supported Render federation path is
established. None has been verified. If that is unavailable, review a dedicated
programmatic principal restricted to the application policy before creation; never
reuse Robert's root/operator identity. Do not create a key as part of this handoff.

Future secure runtime configuration must pin the reviewed bucket, 12-digit owner,
prefix, scope and enrollment hash separately from DB backups, plus the existing
stable privacy digest key. The existing digest secret remains securely retained;
do not copy it into S3. AWS credentials/session tokens belong only in the approved
secret facility/Render private environment, never commands, repository files,
diagnostic dumps, browser URLs or chat. Standard SDK names, if an environment
credential provider is selected, are `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
and (for temporary credentials) `AWS_SESSION_TOKEN`. No values are requested here.
Future application setting names/wiring need a reviewed source change; this adapter
takes explicit configuration and does not imply those environment fields exist.

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

Deleting an individual active chain entry breaks authentication/completeness.
Therefore normal operator access cannot remove active history. Before real use,
finish a reviewed minimization/retirement procedure that carries forward only
still-justified cases and dates into a separately authenticated successor scope,
verifies completeness offline, and safely cuts over the externally pinned scope.
The existing GENESIS format covers only an empty decision baseline; it **cannot**
be reused to pretend a nonempty compacted history is enrolled. That successor-
coverage support is not implemented here and is an activation dependency. It must
be synthetically verified before granting time-limited maintenance permission to
delete the reviewed retired prefix's exact objects **and all versions/delete
markers**. Then remove that temporary permission. This avoids granting app delete
rights or promising indefinite storage; no irreversible Object Lock substitutes
for the approved review process. A configuration administrator's policy change is
a separate reviewed maintenance action, never an automatic restore step.

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

## Exact setup and controlled cloud verification — future approval required

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

Pending CI for this source preparation. Tests use controlled SDK responses and the
existing serial PostgreSQL 18 restore fixtures. No mocked/emulated result is AWS
production verification. See `docs/release-checklist.md` for final source/run links.
