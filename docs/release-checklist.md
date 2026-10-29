# Release Checklist

Use this checklist for backend or dispatcher changes. Mobile app publication is
a separate release and requires its own signed build and store submission.

## Read-only AWS checker follow-up — 2026-10-28

- Robert's direct CloudShell STS command returned account `080413009273`:
  owner-observed PASS. The old checker at `c94fb78` returned
  `STOP_ACCOUNT_UNVERIFIED` without its cause; no IAM/credential fault established.
  Bucket configuration and restricted application credentials remain unverified.
- Small checker-only correction: omit unnecessary stdin/JSON input for parameterless
  STS, keep private parameter stdin for metadata operations, preserve all target/
  expected-owner/read-only restrictions, and retain safe categories/exit codes.
  No application/runtime/privacy workflow changed; dispatcher help remains accurate.
- Revised checker source: `f71a990fcd59d9b04039e1998757cb53f841c00b`.
  Immutable public download HTTP 200/checksum match confirmed without execution.
  Both normal branch CI jobs (`validate`, `privacy-database`) PASS at that exact
  source in [CI 40807298550](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40807298550).
  Pinned Node 24.22.1 Linux validation supplements the focused Node 22.20.0 Mac
  checks; no duplicate local application/database suite. Later docs-only commit
  pins the same executable; no source retest needed for that documentation update.
- No installed AWS CLI/authenticated CloudShell here, so original failure is not
  reproduced. Revised pinned command in `docs/privacy-s3-storage.md` includes bounded
  identity-only comparisons (at most three calls, one attempt/25 seconds each).
  Diagnostics cannot override a failed target check or trigger a write/retry.
- Focused serial local regression: `tests/privacyAwsReadOnly.test.js` 3/3 PASS,
  including actual child-pipe/EOF handling, invocation shapes, timeouts, CLI exit
  categories, malformed responses, secret redaction and mismatch/failure stops.
  Dispatcher-help review and whitespace checks PASS. No AWS call, installation,
  app build, local DB or simulator. Existing application/recovery CI evidence below
  remains valid; no broad local suite repeated.
- NEXT: run the revised checksum-pinned CloudShell command once and return only
  its sanitized JSON. No key/permission changes, production deploy, enrollment,
  gate activation, S3 object write or message authorized by this correction.

## S3 integration closeout — 2026-10-28 Toronto, review only

- Final tested source `649c93884364277322bab21fec27885c708209ca`; both `validate`
  and `privacy-database` PASS in
  [CI 40803657852](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40803657852)
  (completed October 29 UTC / October 28 Toronto). Node 24.22.1 / PostgreSQL 18:
  recovery 5/5, existing privacy/baseline/delivery 22/22, backend 513 passes /
  5 database-only skips / zero failures, both separate timing DB checks and
  dispatcher 69/69. Mac ran only the focused metadata/cleanup/cloud-budget guards,
  type-only and help checks; no local DB, app build or simulator.
- Merged latest main `007cba9` into this review branch at `77a84a5`, preserving
  dispatcher standards. A final fetch found no newer main. Render metadata reports
  API `dep-dbh39puc6qcc73cfb0d0` and dispatcher `dep-dbh39q8u01pc73fg6ufg` live at
  `007cba92ce38132946283f1d67155e809aa9588b`; no fresh runtime/secret read claimed.
  Review changes add no migrations. Production was not merged/deployed by this work.
- Robert confirms AWS account `080413009273`, the private Canada Central bucket,
  versioning/public blocks/SSE-S3/no Object Lock/owner-enforced ACLs, actual bucket
  policy including the IAM-user ARN, and the app user with only its application
  policy. Operator policy exists but remains unattached; no operator role assumed.
  Saved AWS keys on production API are **Save only**, not running-access evidence.
- Runtime source is complete: exact external S3/scope/enrollment pins, dedicated
  stable digest and IAM-user credentials, lazy gates-off startup, no JWT/memory/
  automatic enrollment fallback. All affected privacy reads/transitions fail closed
  for invalid/unavailable/unfinished/sealed history; ordinary gates-off traffic
  remains available. No Pro/OIDC upgrade; Hobby's existing IAM user is preserved.
- Maintenance source is complete: signed source sealing, nonempty CHECKPOINT/CASE/
  COVERED successor state, state-bound reviewed minimization, original dates/holds/
  financial protection and verified retirement permission. Operator-only removal
  verifies the externally pinned active configuration and full retired-version
  manifest before deletion, rejects active/unknown targets and stops on interruption.
  Existing AWS denies remain; no real retirement or enrollment was executed.
- `docs/privacy-s3-storage.md` is the single current resource/configuration/test/
  cost/operator handoff. Actual metadata is still **unverified in AWS**. The new
  read-only checker and reserved-prefix cloud workflow/cleanup are prepared and
  mocked, not executed. Cloud tests need temporary exact-prefix permissions and
  an authorized private CI credential path; expected cost <$0.05, bounded <$0.10
  plus existing included CI only. New manual workflow needs default-branch
  registration under separate review; no automatic trigger is installed.
- NEXT ROBERT ACTION: run the pinned/checksum-verified read-only AWS CloudShell
  command at the end of that handoff; return only its sanitized JSON. It cannot
  prove the application's actual restricted credentials or saved Render settings
  work. Cloud verification, operator identity/maintenance permissions, actual runtime
  read-back, enrollment/cutover and activation remain separate execution dependencies.
- Existing OpenAI/model/provider/device/receipt/QUALIFIED PITR/cleanup evidence and
  retention approvals remain closed. Four false gates/Auto-Deploy Off preserved.
  No AWS setting/write, production data/configuration, messaging, new resource,
  website publication, Android implementation or Apple upload changed.

## Earlier S3 recovery-storage preparation — preserved evidence, 2026-10-28

- Proposed adapter and single setup handoff: `docs/privacy-s3-storage.md`, with
  three IAM/bucket-policy review templates. Canada Central, private S3 Standard,
  owner-enforced ACLs, all public blocks, SSE-S3, versioning; no automatic deletion
  or irreversible Object Lock. Official regional pricing gives about US$0.30/month
  under the explicit 20-request/month, 4-KiB-entry, existing-history assumptions;
  actual volume/account/transfer allowances are not established. No spend approved.
- One conditional immutable object per entry; independent current S3 listing,
  pinned enrollment and enforced no-delete/no-overwrite policies preserve the head
  across PostgreSQL rollback. Versioning is not completeness proof; no head-object
  transaction or privileged-administrator rollback guarantee is assumed.
- Existing 357a552/e998189 evidence remains preserved below. Tested S3 source:
  `5a222be5bb4e18c1afdeec9c025bd4a247b8c653`; both jobs PASS in
  [CI 40727353624](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40727353624).
  Node 24.22.1: 11 new S3 cases; PostgreSQL 18 actual recovery 4/4 using the adapter
  with controlled storage responses; existing privacy checks 22/22. Backend 503
  passes / 5 database-only skips / zero failures; two separate timing DB checks and
  dispatcher 69/69 pass. Local type-only/help/whitespace checks pass. Three policy
  templates parse as JSON; actual AWS evaluation is pending. No AWS verification
  or production wiring. No Mac build/DB suite/simulator duplicated CI.
- The earlier NEXT action (superseded by owner setup/current closeout above) was
  to review this concrete bucket/policy/cost proposal and establish the existing
  AWS account/credential path before any resource/spending authorization. Controlled
  synthetic cloud verification, reviewed successor coverage/removal, exact offline
  production wiring and explicit enrollment must pass before activation.
- All completed OpenAI/model, device, deployment, SMS/email-Junk and QUALIFIED
  recovery/cleanup evidence stays closed. Four false gates/Auto-Deploy Off preserved;
  no AWS setup, production change, messages, new clone, publication or Apple upload.

## Bounded OpenAI privacy follow-up — 2026-10-28

IDENTITY SEARCH CLOSED: Production organization/project identity remains unconfirmed;
no mismatch found. The bounded retained-record search found source setup and
synthetic test references, not an attributable deployed-key-to-project record.
Missing: original provisioning evidence or existing attributable provider metadata
with exact key/org/project identifiers. Stop that investigation; preserve all model
and dashboard evidence and policy caveats. No repeat Shell/dashboard check or AI call.

## Post-snapshot recovery safeguard — synthetic verification passed, 2026-10-28

- Added independent authenticated intent/result journal protocol and minimized case
  snapshots to the existing privacy flow; missing history/store or unfinished work
  fails closed before further decisions. No production adapter is configured.
- Added guarded synthetic-only offline reconciliation reusing preview/erasure and
  financial/ownership guards; original dates and later cancellations/holds survive;
  completed-request retry logic cannot skip restored-data erasure. No new migration.
- Tested source: `357a552ab98bcd705385d2aa2ed5446065a6d3e8`, existing
  `review/customer-account-deletion` branch. Both jobs PASS in
  [CI 40702995563](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40702995563).
  Node 24.22.1 / PostgreSQL 18: actual snapshot recovery 4/4 (parent + three cases),
  existing privacy/baseline/delivery 22/22; backend 492 passes / 5 database-only
  skips / zero failures, two timing-history database checks and dispatcher 69/69.
  Five new journal/target/failure unit cases are included in the backend passes.
  Final review added explicit refusal of missing scoped financial records and newer
  external-retention decisions, with database regressions included in this run.
  Local type-only, dispatcher-help and whitespace checks pass. No Mac application
  build, database suite or simulator duplicated Linux evidence.
- Storage selection + durable adapter/witness verification, reviewed unfinished-intent
  handling and separately authorized production-target wiring remain activation
  dependencies. Synthetic memory state is not a verified production backup solution.
- The subsequent S3 proposal is recorded above. No approved/configured production
  store is established here. Do not provision, deploy,
  restore or enable gates. Existing isolated SMS tooling is unchanged; rerunning
  it with this new source also requires a reviewed journal integration, not a bypass.
- Prior SMS/email-Junk, physical-device, staff, model, QUALIFIED recovery/cleanup and
  business approvals are unchanged. Apple case remains unresolved; Android deferred.
- Handoff closeout: 15/15 focused cross-repository consistency assertions and both
  whitespace checks pass. Proposed customer-facing policy body is unchanged; only
  its review gates were reconciled. Subsequent evidence commits are docs-only and
  reuse the exact tested source above; no extra application run or deployment.

The following OpenAI screen/model details remain completed evidence:

Robert's October 27 screenshot findings are recorded in
`docs/privacy-technical-configuration.md`: Personal / Default project, Global;
feedback, evaluation/fine-tuning and input/output sharing Disabled; API logging
Enabled per call; audit logging not enabled; no ZDR approval/custom retention period
displayed. One active Speedy Sweeties Render key, created September 14 / last used
October 26. No settings/keys changed. These screen checks are closed for that project,
not evidence of an exact match to production's credential. Name/date/masked-ending
evidence alone cannot establish identity.

Read-only Render metadata still identifies API dep-dbg3m4afngtc738jad20 at 4ac2ba3.
The three callers/configuration match deployed source and still use one key with
store:false, no organization/project headers. OWNER SHELL READ-BACK PASS, October 28:
all three model overrides are UNSET; each effective model is gpt-5.6-luna by the
reviewed fallback rules. Target/revision/production/no-local-dotenv/key-presence and
all-four-gates-false checks are true; result SHELL_ENVIRONMENT_READ_ONLY. This is
owner-provided deployment-Shell evidence, not a live AI request or agent inspection
of application memory. NOT_ESTABLISHED is an evidence-limit label, not a mismatch.
The bounded existing-record investigation is now closed as unconfirmed, with no
mismatch found; see the evidence limit above. No further identity search is queued.
Do not repeat completed account-screen/model checks, retrieve keys, call AI, deploy
or enable privacy. Global is not Canada-only/US-only and
store:false is not ZDR. Existing Resend delivery-only/Junk, SMS, deployment, physical
device, staff and QUALIFIED recovery evidence is unchanged. All four privacy gates
false and Auto-Deploy Off remain the required operating state.
The documented command passed 15 synthetic no-network cases; no application suite,
build, simulator or agent-run live check was repeated. Robert's subsequent read-back
is recorded above without rerunning the command/tests. Documentation whitespace checks passed.

## PR 93 production closeout — 2026-10-27

LATER OWNER RESEND UPDATE, October 27: existing account recovered, no new account/
key. Transactional Free; notify.speedysweeties.ca DKIM and both sending CNAME records
Verified; domain ready to send; open/click tracking unconfigured; TLS Enforced.
Existing Onboarding key has Sending access / All domains. Robert preserved that key
and used SAVE ONLY for `PRIVACY_VERIFICATION_FROM=Speedy Sweeties <no-reply@notify.speedysweeties.ca>`.
All gates false / Auto-Deploy Off. This is saved, not active runtime configuration;
an absent/old running sender is expected and does not warrant another deployment.
Dashboard readiness alone establishes no delivery, retention/removal or full in-app
privacy pass; the subsequent owner-only delivery result is recorded separately below.

OWNER-PROVIDED DELIVERY PASS, October 27: one send attempt; HTTP 200;
`providerAccepted=true`. Robert separately confirms actual receipt at
speedysweeties@hotmail.com in **Junk, not Inbox**. Inbox placement remains unresolved;
no cause is inferred and no DNS change is justified by this observation alone.
No separate provider dashboard delivery event is claimed. Normal verification-code
email, full in-app privacy flow, fulfillment and provider retention/removal remain
unverified. Do not resend, deploy or enable gates to close this documentation item.

Completed owner-only email test: exact preview/command retained as a do-not-rerun
artifact in `docs/privacy-technical-configuration.md`, section Resend owner closeout and
single-email preparation. Reuses the deployed pure delivery adapter in an existing
authenticated API Shell, with a process-local sender and test subject/body; no
app/database startup, gate mutation, real OTP or customer write. Exact recipient
speedysweeties@hotmail.com. Explicit SEND ONE EMAIL confirmation, one request,
fixed idempotency and instance attempt marker; never automatically retry.
33/33 focused mocked command checks passed serially; real-PTY cancellation exited
with zero transport calls/marker writes. Mac harness Node 22.20.0 is not a new
production-runtime verification; command requires existing verified Node 24.22.1.
Application source and prior CI/SMS/deployment/physical-iPad evidence are unchanged.
This evidence-only update sends no message and makes no deployment, settings change,
publication or Apple submission; all four gates remain false and Auto-Deploy Off.

LATEST: Robert corrected the earlier "existing key preserved" report: the original
clipboard-only key was not retained. He generated/saved a fresh initial dedicated
key, retained a secure backup, and corrected the timeframe. Backup/generation are
owner-reported; no secret value was retrieved. Independent pre-deploy read-only
inspection confirmed all six privacy tables empty, no Customer/Order privacy state
and no retained receipt evidence. This is initial setup, not approval for rotation
after privacy state exists.

API-only redeploy `dep-dbg3m4afngtc738jad20` is live at
`2026-10-27T05:49:16.234906Z`, same approved merge
`4ac2ba372ae23972ee665a77ce241c3d267ea107`. Node 24.22.1; unchanged build -> migrate
deploy -> start sequence; no pending migrations. Health/readiness and disabled
privacy GET passed. Post-live DB checks: 48 complete/zero unresolved migrations,
four privacy migrations complete, four enabled guards, all privacy-state counts
still zero. Observed post-live error-level logs returned no entries. Auto-Deploy
remains Off on all three production services; dispatcher/cron/staging/SMS unchanged.

**CONFIGURATION CLOSEOUT PASSED:** Robert returned new-Shell sanitized JSON after
this deployment: exact `4ac2ba3`, all four gates exactly false, dedicated key length
>=32/distinct from JWT, and admin/policy/timeframe/fiscal matches all true. This is
owner-provided runtime evidence, not agent inspection of secret/backup contents.
The earlier failures/prior redeploy remain historical in the technical document.
After the pass, independent read-only checks confirmed dispatcher still live at
`dep-dbg2mgkipgvc73ease2g` on the same SHA; page/JavaScript asset both HTTP 200.
No additional dispatcher deploy was needed or made. Reused tests/schema evidence;
no application change, local build/test, simulator or live mutation test.

- **Merged and deployed, all privacy gates off.** Robert approved review head
  `d8291bbba745fbac62e0ff25816e51dd384d4b87` and privately confirmed the eight exact
  non-secret values plus dedicated digest-key presence/secure retention. Merge:
  `4ac2ba372ae23972ee665a77ce241c3d267ea107` (baseline `c5f249f`).
- API `dep-dbg2lf4ipgvc73eapitg` live `04:39:20Z`; dispatcher
  `dep-dbg2mgkipgvc73ease2g` live `04:41:20Z`, both on 2026-10-27 UTC and that SHA.
  API passed before dispatcher deployment. All four migrations completed in order
  before API startup; 48 total complete, zero unresolved. Six privacy tables/64
  scalar columns and all four enabled protection triggers verified read-only.
- Live/readiness 200 with database `ok`; disabled privacy GET 503/
  `PRIVACY_SERVICE_UNAVAILABLE`/`no-store`; nonexistent tracking ID 404;
  dispatcher HTML and JavaScript asset 200. Empty privacy/erased-order state.
  Recent post-start error-level queries returned no entries. No live mutation test.
- Reused both passing CI jobs at `b3d6b128` (PR run 40438700778; push run
  40438694962): only two documentation files changed afterward. No required GitHub
  check bypass, local test/build/simulator rerun or app-source change.
  Automatic merge-push CI subsequently passed both jobs on exact deployed
  `4ac2ba3`: [run 40450819956](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40450819956).
- Auto-Deploy independently **Off on API, dispatcher and cron**. Cron unchanged
  at `c5f249f`, build-verified only; no manual run. Ordering staging/SMS untouched.
- Saved configuration was owner-observed; the final sanitized runtime check passes
  every required boolean above, superseding the historical failed checks.
  Authenticated staff reads **PASS on owner-run production evidence**: Robert's
  `SPEEDY_STAFF_READONLY` result reports profile/orders HTTP 200, both schema checks
  true, deliveredRowsPresent=true and passed=true. The two documented GETs ran in
  his existing production Safari session; no token or response rows were shared.
  Apple Events JavaScript stayed disabled. No agent-run request, live retry or
  application test rerun. See `docs/privacy-technical-configuration.md` for exact
  evidence, timestamps, commands and rollback boundary. No rollback was required.
- Recovery exercise/cleanup are complete; original result stays **QUALIFIED**.
  Production enum ordering is assessed/non-blocking; no new restore copy or migration.
- NEXT: final website/provider/external-copy prerequisites
  before separately approved activation
  and controlled in-app verification. Apple case 103005572330 remains unresolved;
  Android deferred. No website publication, iOS rebuild/archive/upload/submission.

Website handoff update, 2026-10-27: `webflow/README.md`, unpublished
`webflow/account-deletion-page.html` and the iOS `PRIVACY_POLICY_PROPOSED.txt` now
distinguish the deployed gates-off API from unverified production initiation/
fulfillment, and preserve the successful isolated Twilio result without calling it
an in-app pass. Android draft controls are not advertised as already released.
Effective date is the actual publication date, not a new business decision.
Read-only Webflow inventory still contains only Home; no remote page write or
publication. The policy candidate's EDITOR RELEASE GATES is the finite remaining
provider/external-copy/restore-operation fact list. Preserve Home and all gates off.
Focused review-HTML assertions pass (labelled heading, contact-only links, no form/
script/API call, adopted retention terms). No application suite/build was repeated.

Privacy fact correction, 2026-10-27: Robert uses TurboTax to prepare/file taxes.
Older receipts remain physical paper; digital receipts began with the current
dispatcher. Neither scanning/import of older receipts nor customer-profile/receipt-
copy storage in TurboTax is established. The iOS policy/retention handoff and
`docs/privacy-technical-configuration.md` distinguish those owner-confirmed practices
from the digital field mapping; all approved retention decisions are unchanged.

Scoped technical follow-up confirmed provider/logging source matches deployed
`4ac2ba3`; ten existing health-readiness log entries match redacted route format.
No blanket all-log redaction or provider retention claim follows. Account log-stream
settings/export inventory remain inaccessible through the connector; exact read-only
dashboard checks are in the technical document. The known recovery windows and
completed **QUALIFIED** rehearsal/cleanup remain recorded, not reopened. Documentation
only: no application tests/build, messages, new restore, publication or configuration
change; all gates false and Auto-Deploy Off remain the operating constraints.

Render follow-up, 2026-10-27: owner-provided screenshot evidence records **Speedy's
workspace / Hobby / Log Streams default destination None configured (Set default
displayed)**, settings unchanged. Robert separately reports production Recovery's
logical-export list **empty**, with no settings changed. Close those specific
account checks. The screenshots do not establish native retention or backup inventory;
the export observation is separate evidence and does not mean PITR backups are absent.
Current official documentation lists seven-day native log retention for Hobby and
no Hobby per-service log-stream overrides. These are documentation-based findings,
not an account-level purge test or an all-copy deletion guarantee. See the technical
document for sources/limits. Remaining provider controls, operator copies and
post-snapshot privacy reconciliation are still open. No new tests/resources/settings.

Consolidated privacy-publication preparation, 2026-10-27: current official Twilio
Verify, Resend and OpenAI arrangements are now separated from source observations
and unresolved effective account controls in `docs/privacy-technical-configuration.md`.
Its **One consolidated factual handoff** is the single remaining dashboard/owner
request; no provider/account secret was read and no delivery was attempted. Resend
saved sender/domain setup was subsequently closed by the owner evidence at the top;
the subsequent owner-only delivery pass is recorded above. Inbox placement, normal
verification-code email, full in-app flow and runtime activation remain open.
Eligible email is preferred and email-off does not trigger SMS fallback.
OpenAI `store:false` is not account-level ZDR.
The unpublished iOS policy now includes supported processing/removal facts without
claiming account defaults are verified settings. Paper/TurboTax provenance and all
approved retention/review rules remain unchanged.

Historical October 27 restore assessment (implementation status superseded by the
October 28 tested review change at the top): same-database markers can be lost in
an older snapshot, and blindly importing completed requests would make `fulfill`
return before erasing restored data. The technical document proposes a minimized
independent decision checkpoint, offline reconciliation using the existing flow,
and a serial synthetic-only restore test preserving original dates, later holds/
cancellations and financial evidence. That implementation and synthetic verification
are now complete in review; durable production storage/wiring remain unimplemented
and fulfillment remains blocked. Completed QUALIFIED recovery/cleanup and production enum findings are
preserved. No new production-data clone or broader recovery audit is needed.

That October 27 update changed documentation only, reusing deployed-commit CI 40450819956.
Focused documentation consistency checks passed **16/16**, and `git diff --check`
passed in both checkouts. The disposable checker normalized Markdown emphasis
after an initial literal-text mismatch; no application assertion was changed.
At that update source/tests/workflows matched deployed `4ac2ba3`; the later October
28 review source and its separate CI evidence are recorded above, not deployed.
All four gates remain false and Auto-Deploy Off; no settings, customer data, messages,
resource operations, publication or Apple upload. The older next-action wording is
superseded by the tested review change and remaining storage dependency above.

## Node 24.22.1 advisory update (2026-10-26; deployed separately as PR 96)

- Follow `docs/node-runtime-security-2026-10-26.md` for observed API/dispatcher/cron
  versions, owner-observed absence of `NODE_VERSION`, exact source pins, compatibility
  evidence, and the separately approved fresh-build/certificate verification plan.
- Require exact-head Linux CI, including the dispatcher production build and two
  isolated PostgreSQL timing-history checks. Do not confuse the documented local
  Mac case-collision build limitation with a successful production build.
- No dependency graph, application workflow or migration change. Never bring the
  privacy branch into this security merge. Preserve its existing recovery evidence.
- Production Auto-Deploy is Off for API, dispatcher **and retention cron** after
  the separately approved security rollout. Keep it Off. API/dispatcher runtime and
  certificate checks are closed on owner-provided Shell evidence; cron remains
  build-verified only. See `docs/production-security-maintenance.md`.
- Runtime/CA verification and no-order/no-message smoke checks replace live mutation
  tests for this update. Do not Trigger Run on the cron: DRY_RUN still writes audit
  records. Existing staged/SMS resources are not security test targets.

## Before opening the pull request

- Confirm the worktree contains only the intended release.
- Update the How do I…? articles alongside every dispatcher workflow change,
  including underlying backend behavior. Verify exact labels, roles, side
  effects, review dates, evidence and help navigation. Run
  `npm run check:dispatcher-help -- <base-ref>` and record affected guide IDs and
  example questions in the PR. See `AGENTS.md` and `docs/dispatcher-help.md`.
- Run `npm ci` and `npm run check` from the repository root.
- Run `npx prisma format --check` from the repository root.
- Run `npm ci` and `npm run check` from `speedy-dispatcher/`.
- Run `npm audit` in both directories and review every reported advisory.
- Confirm no production credentials, customer data, generated build output, or
  local environment files are included.
- Document any database migration, environment-variable, or rollout dependency
  in the pull request. State explicitly when there is none.

## Before merge and deployment

- Obtain explicit merge approval.
- Require the GitHub Actions checks to pass on the current commit.
- Reconfirm the production target and any required configuration.
- Identify the prior healthy commit so the code rollback target is known.
- Do not run destructive or production database commands as part of validation.

## PR 93 integration/recovery and isolated Twilio history

The production closeout above supersedes historical draft/undeployed status below.

Current security prerequisite: PR 96 is merged and deployed at
`c5f249fc079f2faa5ff99c61b193a0626eccc3aa`. API and dispatcher runtime/certificate
items are CLOSED on Robert's owner-provided production Shell results; cron remains
BUILD-VERIFIED ONLY with no extra run. See the sanitized closeout in
`docs/production-security-maintenance.md`. Auto-Deploy is Off for all three.
That security main is now integrated into this existing privacy review branch,
preserving both Node pins/guards, full-history dispatcher-help validation, serial
timing-history and privacy database validation. Both CI jobs select `.node-version`.
Combined integration commit `b597f5e8b6011e9cfc0fc778e87073143ecf7f9e` passed both
`validate` and `privacy-database` in [PR run 40438313429](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40438313429)
and [push run 40438309354](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40438309354).
Both jobs report Node 24.22.1. Backend: 454 passes, four database-only skips covered
by the dedicated jobs; timing history: two passes; dispatcher: 69 passes and Linux
build; privacy database: 22 passes, none skipped. Exact final documentation-head CI
is recorded in PR 93; no older run is relabelled as that head. No production change
is part of this review-branch integration.

The separately approved **all-four-gates-false** merge/rollout is now completed
above; do not reopen that approval. The narrow enum assessment is complete: Robert's
fresh production inspection found matching names/label sets for all 13 enums and
only `OrderStatus` ordering differs. Review of deployed `c5f249f` and PR source
`1815085` found no status ordinal sorting/range/aggregate dependency; explicit
equality/membership and application priority/date sorting are independent of it.
All four privacy migrations leave `OrderStatus` untouched. **This difference does
not block the gates-off deployment and requires no reorder/migration.** Details
and evidence limits are in `docs/privacy-technical-configuration.md`.
Do not repeat the broad audit or recreate the deleted recovery copy. Cleanup of
`dpg-dbg14b59el5s73bj1sm0-a` is **CLOSED**: Robert reported deletion, exact-resource
lookup returned HTTP 404, and the workspace inventory omitted it by
`2026-10-27T04:01:22Z` (October 27, 00:01 Toronto). Production, ordering staging and
SMS databases remain Available. No replacement or additional resource was created.
Robert's approved US$6.30/month including storage, prorated, maximum 24-hour scope
was preserved; removal was confirmed less than 68 minutes after creation. Actual
invoice charges were not observed. The owner-selected point was
`2026-10-26T21:45:00Z`; the copy was restricted to only the verified Mac IPv4 `/32`.
The private read-only run at `2026-10-27T03:52:24.397Z`
completed: all 44 migrations, 24 application tables/296 columns, expected indexes/
foreign keys and financial-record readability checks passed; no tested orphan join.
Original result stays **QUALIFIED** because one of 13 ordered enum comparisons
differs; the saved report cannot establish whether labels or only order differed
in that deleted clone. Fresh production evidence does not prove its exact mismatch.
Do not claim full clone schema equivalence or an unconditional restore pass. The
same TLS, REPEATABLE READ READ ONLY connection used 15-second statement/two-second lock
timeouts and rolled back/disconnected. No migrations or customer mutations ran.
The closed copy cannot be queried again; cleanup and the production assessment do
not resolve that historical evidence limit or authorize another paid resource.
Full workflow restoration and post-snapshot reconciliation remain later activation
requirements. No application change/test rerun is needed for this documentation-only
assessment; unchanged combined CI evidence is preserved. See the rehearsal/cleanup entry in
`docs/privacy-technical-configuration.md`.
PR 93 is merged; keep Auto-Deploy Off. Apple eligibility, website publication
and later in-app/fulfillment checks remain separate open gates.

Preserved privacy integration evidence (2026-10-26): integrated application
revision `4aa373e7a50c1f79c047a7fa7e9260be9a3c431f` passed both CI jobs in PR run
`40406476683` and push run `40406469607`. Its then-current main was `7bcaaf7`;
that evidence does not cover the later security integration by itself.
Documentation head `770ef237e83ff886b78c9eace2a65e0ef55ff536` subsequently passed
both CI jobs in PR run `40408519711` and push run `40408512266` (automatic CI;
application content unchanged). Production health and pre-privacy schema were
rechecked. Robert's 2026-10-26 Recovery inspection establishes a three-day PITR window
and the displayed statement that logical exports are retained at least seven days.
It did not establish an existing export, exact selectable point or completed restore.
The later protected one-clone exercise above records owner approval, the selected
`2026-10-26T21:45:00Z` point, actual qualified verification and confirmed cleanup;
the earlier no-approval/no-clone status is superseded. Runtime remediation is
complete for the two web services on the evidence above. The historical clone
qualification remains recorded, while the separate production enum assessment
establishes no blocker from this difference for gates-off deployment. Follow the
exact configuration, protected restore exercise and no-order/no-message
smoke plan in `docs/privacy-technical-configuration.md`; historical isolated reset
evidence below is not a backup-restore pass. All four production gates must be false
for the separately approved deployment. Full combined validation runs in Linux CI;
do not duplicate unchanged suites or launch simulators on the resource-limited Mac.

- Keep `speedy-api`, `speedy-sweeties-db`, `speedy-ordering-staging` and its database
  unchanged. Do not use either existing service as the privacy API test target.
- Require the current review-branch CI privacy job to pass serially against only
  `speedy_privacy_synthetic`, including the real-route mocked-delivery test.
- Follow `docs/privacy-isolated-twilio-test.md`. Provision the smallest paid database
  only after Robert approves the dashboard estimate; configure a new auto-deploy-off
  service with separate secrets and no production environment group.
- Before a live attempt, prepare one synthetic phone-only source order, show only the
  masked destination and obtain Robert's explicit authorization for exactly one SMS.
- Keep fulfillment and email disabled. Require the test client to prove fulfillment
  is rejected and data unchanged, then cancel the synthetic request.
- The authorized 2026-10-24 attempt reached the isolated challenge route at
  `13:19:28Z` but returned `VERIFICATION_DELIVERY_UNAVAILABLE`. Read-only Twilio
  diagnostics found valid credentials (`HTTP 200`), an active Full account and a
  Verify Service owned by that account, but no accepted Verification Attempt or
  Monitor Alert in `13:17Z`–`13:22Z`. The pre-diagnostic adapter did not retain the
  provider response, so its HTTP status/code remain unknown. Do not retry. The next
  owner check is Twilio Console > Verify > Settings > Geo permissions: confirm the
  Canada SMS setting and record its displayed state without changing it first.
- Robert's read-only Console inspection on 2026-10-24 confirmed Canada `SMS & RCS:
  Allow All Traffic` and `Voice: Disable All Traffic`; no setting was changed. Do
  not attribute the failed SMS attempt to Canada being disabled. The next diagnostic
  is a read-only inspection of Twilio Verify Logs and Monitor Error Logs for
  `2026-10-24 13:17Z` through `13:22Z`: record only whether a Verification exists,
  its provider HTTP status and numeric error code. Do not copy destinations, SIDs,
  OTPs, request/response bodies or trigger another verification.
- The follow-up Console inspection found zero Verify verifications and zero Blocked
  Verifications in the last 30 days, plus no US1 Monitor Debugger results in the
  last 24 hours. These are negative observations, not proof that the original HTTP
  request never reached Twilio: the adapter then in service did not retain the
  provider status/error or distinguish a rejection, malformed success, network
  failure, ten-second timeout, or failure in the post-send database update.
- Code-path review found no evidenced construction defect. The private client
  accepts a valid Canadian ten-digit number and normalizes it to E.164; the fixture
  stores the matching national digits; source-order/contact validation reconstructs
  the same `+1` destination; and the adapter uses the configured Verify Service
  `/Verifications` endpoint with Basic Account SID/Auth Token authentication and
  form-encoded `To` plus `Channel=sms`. Existing mocked adapter and real-route tests
  cover those transformations. The original cause is therefore unrecoverable. One
  separately authorized retry with the already-added sanitized instrumentation is
  required; do not send until the client again shows only the masked destination
  and Robert authorizes exactly one SMS.
- A 2026-10-24 reset audit reconfirmed the isolated identities before any database
  operation: service `srv-dbe3861srm7s73dgfe50` (`speedy-privacy-isolated`) and
  database `dpg-dbe37v59fdbs73961o3g-a` (`speedy-privacy-synthetic`, database name
  `speedy_privacy_synthetic`). Production `srv-d7ntlnpkh4rs73bev9q0` /
  `dpg-d7m33g2qqhas73f58hrg-a` and ordering staging
  `srv-davc147avr4c73bd7eig` / `dpg-davbqnhsrm7s73bd3uq0-a` are explicitly excluded.
  Existing tooling cannot safely reset the used fixture: the Render preparer exits
  when the schema is complete and only rebuilds an incomplete schema after proving
  all customer-bearing tables empty, while normal isolated-server startup requires
  zero Customer, Order and User rows and stores fixture identity only in process
  memory. The prior single-use fixture left synthetic rows after that process ended,
  and privacy request/audit tables add dependent and `ON DELETE RESTRICT` records.
  There is no existing reset command or authenticated reset route. Do not improvise
  table deletion, weaken the startup assertion or turn messaging routes back on;
  add reviewed, identity-guarded synthetic reset tooling only with separate owner
  authorization.
- Robert subsequently authorized that narrowly scoped reset tooling for the same
  service/database only. Before executing it, require the injected Render service
  ID/name, configured database resource ID, connection host, database name and user
  all to match the approved target. Require a complete schema and prove the only
  application rows are the exact single synthetic Customer, Order, User and
  failed-delivery PrivacyChallenge. Reject any changed marker, provider reference,
  completed challenge, privacy request, receipt or other populated application
  table before `DROP SCHEMA`. Keep the one-shot reset gate in the build-only test
  preparer, never the production server or a public route. After rebuilding, verify
  the pinned schema, all four protection triggers and zero application rows, then
  disable the reset gate before enabling the instrumented phone-only retry.
- Reset execution completed on 2026-10-24 against only those exact resources at
  commit `3cc6a3a1ae732ad8267e0300145c75b9784d4b69`. Diagnostics-only deploy
  `dep-dbef2tu7bikc73888eq0` verified the injected service identity, database
  resource/host/name/user, complete schema and exclusively synthetic row set before
  rebuilding: Customer=1, Order=1, User=1 and PrivacyChallenge=1, with every other
  application table empty. The rebuilt pinned baseline and four privacy migrations
  then passed required table/column checks, all four protection-trigger checks, and
  zero-row checks across 26 customer-bearing tables and every application table.
  No fixture value, destination, token, OTP or credential was logged or retained in
  this evidence.
- Retry deploy `dep-dbef3i0m7kps73dmn8f0` is live on the same commit with the reset
  gate disabled, diagnostics-only mode off, phone/deletion gates on, and email plus
  fulfillment gates off. Startup verified zero Customer, Order and User rows and an
  authenticated loopback request to the real preflight route returned ready=true,
  fixtureCreated=false, phone=true, email=false and fulfillment=false. External
  `GET /health` returned HTTP 200 with synthetic scope; unauthenticated preflight
  remained HTTP 404. Auto-deploy remains off. Production remained live at
  `12b78cc4780c96efa286c167c63ac1676dfc5dbb`, and ordering staging remained live at
  `203b39990f008de28f066caed0b4635e8c233317`. No SMS was sent.
- The first instrumented retry at `2026-10-24T19:19:10Z` was rejected by
  Twilio before a Verification was accepted: the sanitized adapter record is
  `outcome=rejected`, provider HTTP `403`, numeric code `21608`. The adapter did
  not receive a success response or provider reference, and the post-send
  database update was not reached. Preserve this as the provider evidence for
  that attempt; it was not a network/timeout, malformed-success or post-send
  database failure.
- Robert confirmed on 2026-10-24 that the intended test destination ending
  `8097` is successfully verified under Twilio Verified Caller IDs. This is an
  owner-observed test-account configuration fact, not evidence of a new
  delivery. No credential, Geo Permission or application change was made. A
  fresh guarded synthetic fixture and separate authorization at the masked
  `SEND ONE SMS` prompt are still required before exactly one further attempt.
- After that confirmation, guarded reset deploy `dep-dbege71srm7s73c2odq0`
  independently reverified the exact authorized service/database identity and
  refused to proceed until it proved the failed fixture contained only one
  synthetic Customer, Order, User and PrivacyChallenge, with every other
  application table empty. It rebuilt the pinned baseline and privacy migrations,
  verified all protection triggers and zero rows, and exposed no destination or
  secret. Retry-ready deploy `dep-dbegf62vcj2c73csjm7g` is live at
  `e1ec40870e03e8c2785e56567df39f501fd157a1` with reset disabled, phone/deletion
  enabled, email/fulfillment disabled and auto-deploy off. Authenticated loopback
  preflight reported ready with no fixture or message created; external health was
  HTTP 200 and unauthenticated preflight remained HTTP 404. Production and ordering
  staging remained on `12b78cc4780c96efa286c167c63ac1676dfc5dbb` and
  `203b39990f008de28f066caed0b4635e8c233317`, respectively. No SMS was sent.
- Before the authorized reset, the read-only check found the isolated database
  available and diagnostics deployment `f1c34c8e68c39ab5684e403e60b5ade654121edf`
  live with auto-deploy off. `GET /health` returned HTTP 200 with synthetic scope,
  and retry preflight returned HTTP 404 because diagnostics-only mode deliberately
  left all fixture and messaging routes unmounted. That check sent no SMS and made
  no reset, deploy, credential rotation or environment change.
- The final separately authorized attempt reached the instrumented Twilio adapter at
  `2026-10-24T19:38:00Z`. The provider returned HTTP `201` with a syntactically
  valid Verification SID and status `pending`, so the application accepted the
  Verify start; this was not a network/timeout, malformed-success or post-send
  database failure. The SMS did not arrive. Robert's later read-only Console check
  recorded the SMS delivery attempt as `undelivered`, numeric error `30007`, on
  Canada/Telus. A pending Verification is not a delivered message, and no OTP check
  or fulfillment followed. Robert submitted a Twilio support ticket. Treat delivery
  as unresolved: do not send another message or change the verification architecture
  while support investigates. Twilio documents 30007 as provider or carrier
  filtering; this record does not establish which layer made the decision.
- On 2026-10-26, Twilio support reported that its carrier partner identified a false
  positive, remediated it and requested another test. Record this only as a
  provider-reported correction; it is not a verified delivery success and does not
  clear the production phone gate. One further isolated attempt still requires the
  existing masked-destination prompt and Robert's explicit one-message authorization.
- For that retest, guarded reset deploy `dep-dbfo4vui0phs73d86vv0` at
  `ef944a0c54d7d49d6d923de8a411333109857bb1` reverified the injected service ID/name,
  database resource/host/name/user, complete schema and exclusive disposable fixture.
  The only application rows were one fixed synthetic Customer, Order, User and
  accepted-but-unverified PrivacyChallenge; every other application table was empty.
  It rebuilt the pinned baseline plus four privacy migrations, verified the four
  protection triggers, 26 customer-bearing tables and zero application rows. No
  destination, provider SID, token, OTP or credential was logged.
- Retry deploy `dep-dbfo5mui0phs73d89hq0` is live at that commit with reset and
  diagnostics disabled, deletion/phone enabled, email/fulfillment disabled and
  auto-deploy off. `GET /health` returned HTTP 200 with synthetic scope; authenticated
  loopback preflight reported ready with no fixture or message, while unauthenticated
  preflight returned the intentional sanitized 404. No SMS was sent during reset,
  deployment or preflight.
- Robert reported that the separately authorized 2026-10-26 controlled-client run
  completed with `smsAttempts=1`, an approved verification, source-order binding,
  `SUBMITTED` request status, a recorded due date, rejected fulfillment with records
  unchanged, and final `CANCELLED` status. This is one SMS attempt in this successful
  run, not a claim that only one SMS occurred across all sessions: preserve the
  earlier cancelled client session and the `403`/`21608` plus accepted-but-undelivered
  `30007` history. The sanitized Render adapter log at
  `2026-10-26T16:50:31.573Z` corroborates provider acceptance of the Verify start with
  HTTP `201`. The adapter does not log successful Verify checks and no sanitized route
  log corroborated request/status/cancel, so those are owner-provided client results.
  Fulfillment remained disabled and was not performed. This closes the isolated
  verification/request/status/cancellation check only; production activation and the
  iOS in-app verification/deletion flow remain pending.
- Cleanup is deferred only for this separately requested retest. Isolated service
  `srv-dbe3861srm7s73dgfe50` and paid database `dpg-dbe37v59fdbs73961o3g-a` remain
  active. Remove both promptly after the test and sanitized evidence capture so the
  database does not continue accruing prorated charges.
- Delete the exact isolated service/database after sanitized evidence is retained.
  This gate never authorizes production deployment, production deletion or customer
  messaging.
- The 2026-10-24 closeout inventory independently reverified the exact resource
  identities in Speedy's workspace: web service `srv-dbe3861srm7s73dgfe50`,
  `speedy-privacy-isolated`, branch `review/customer-account-deletion`,
  auto-deploy off; and database `dpg-dbe37v59fdbs73961o3g-a`,
  `speedy-privacy-synthetic`, database `speedy_privacy_synthetic`, Ohio,
  0.1c/256 MB. Production and ordering-staging IDs remain different. The connected
  Render tools expose no delete operation. Use the service dashboard
  <https://dashboard.render.com/web/srv-dbe3861srm7s73dgfe50> Settings/Danger Zone
  first, then the database dashboard
  <https://dashboard.render.com/d/dpg-dbe37v59fdbs73961o3g-a> Settings/Danger Zone;
  read back each ID/name immediately before confirming deletion.

## After deployment

- Confirm the hosting platform reports a successful deployment of the expected
  commit.
- Verify both `GET /api/v1/health/ready` and `GET /api/v1/health/live` succeed.
- Open the dispatcher and confirm authentication and live-order loading.
- Check recent production logs for startup errors and unexpected 5xx responses.
- Exercise the specific feature changed by the release with a non-destructive
  smoke test.
- Ask a matching How do I…? question and a follow-up, expand its source guide,
  and check navigation under the appropriate staff role. Release the backend
  knowledge and dispatcher destination changes together when both changed.
- Record any remaining physical-device or live-delivery field test separately;
  passing CI does not replace field verification.

## Rollback

If the service is unhealthy or the changed workflow fails, stop further rollout
and redeploy the last known healthy commit. Database rollback requires a
separate reviewed plan; never improvise a destructive production migration.
