# Privacy deletion technical configuration and isolated evidence

Updated 2026-10-27. The production findings came from repository inspection plus
read-only Render/PostgreSQL and mailbox access. The isolated-test update separately
used the authorized disposable service/database reset and deploy sequence; no secret
value was requested or displayed and no message was sent. Ordering staging, backups
and customer records were not changed. The later, separately authorized PR 96
security rollout is recorded below; this evidence update itself is documentation-
only and does not activate privacy behavior. The approved gates-off PR 93 rollout
below supersedes earlier undeployed/draft status statements; it does not authorize
customer initiation, verification delivery or fulfillment.

## Production rollout — initial-key correction deployed; runtime read-back passed

**Latest execution, 2026-10-27:** Robert corrected the earlier key-preservation
report: the original clipboard-only key was not retained. He generated and saved a
fresh **initial** `PRIVACY_DIGEST_KEY`, retained a secure backup, and corrected the
completion timeframe. Key generation/backup are owner-reported, not agent-inspected;
no key value was retrieved, printed, logged or committed. This supersedes the
earlier "existing key preserved" claim. It is not evidence that rotating a key
after privacy state exists is safe.

Before redeployment, independent read-only inspection of exact production resource
`dpg-d7m33g2qqhas73f58hrg-a` / `speedy_sweeties_db` found **zero rows in each of all
six privacy tables**, zero Customers with either privacy-verification field set,
zero Orders with either privacy-erasure/retention field set, and zero DigitalReceipts
with retainedChargeEvidence. There were 48 completed and zero unresolved migrations.
This corroborates the owner's no-existing-privacy-state report for initial key setup.

Under the existing approval, **only speedy-api** was redeployed as
`dep-dbg3m4afngtc738jad20`, exact unchanged approved source
`4ac2ba372ae23972ee665a77ce241c3d267ea107`, live at
`2026-10-27T05:49:16.234906Z`. Current main, Auto-Deploy Off and the unchanged build
-> `npx prisma migrate deploy` -> start commands were checked before triggering.
Logs identify Node 24.22.1, successful build at `05:48:33.502136223Z`, no pending
migrations at `05:48:49.873683327Z`, pre-deploy completion at `05:48:54.272076836Z`,
then the application start command at `05:49:06.820733579Z`.

Post-live read-only checks passed: liveness/readiness HTTP 200, database `ok`,
disabled privacy admin GET HTTP 503 / `PRIVACY_SERVICE_UNAVAILABLE` / `no-store`;
48 completed/zero unresolved migrations, all four privacy migrations complete,
four enabled protection triggers, and all privacy-state counts above still zero.
The observed post-live error-level query returned no entries. Reused unchanged
schema and exact-merge CI evidence; no application change, local build/test or iOS
rebuild. Dispatcher/cron/staging/SMS were not deployed or reconfigured. Auto-Deploy
was independently rechecked Off on API, dispatcher and cron.

**Runtime configuration PASSED on owner-provided new-Shell evidence.** After this
deployment, Robert returned the sanitized output below (not an agent-run Shell):

```json
{
  "commit": "4ac2ba372ae23972ee665a77ce241c3d267ea107",
  "allFourGatesExactlyFalse": true,
  "dedicatedDigestKeyPresent": true,
  "digestKeyDistinctFromJWT": true,
  "adminMatches": true,
  "policyMatches": true,
  "timeframeMatches": true,
  "fiscalYearMatches": true
}
```

This closes the configuration read-back, including key length >=32/distinct from
JWT and exact approved admin, policy, timeframe and fiscal values. It does not
inspect backup storage or establish key entropy. All four gates remain exactly
false. Preserve this initial key; future changes require a persisted-state assessment.
After the pass, the agent independently confirmed the dispatcher remains live on
the same SHA at `dep-dbg2mgkipgvc73ease2g`; its page and referenced JavaScript asset
both returned HTTP 200. **No repeat dispatcher deployment was necessary or made.**
Cron remains unchanged on `c5f249f` / `dep-dbg083uk1f9s73aunkd0`, build-verified only.
Authenticated existing-session staff reads remain unavailable, not passed. No
activation, messaging, production data mutation test, website publication or
app-store action is included. The gates-off rollout/configuration closeout is complete;
account-deletion activation and Apple submission readiness are not.

### Staff-read follow-up — 2026-10-27, execution pending

Robert confirmed an existing signed-in production dispatcher Safari tab on his
MacBook. Read-only tab discovery found the exact production origin, but Safari
returned `JAVASCRIPT_FROM_APPLE_EVENTS_DISABLED` for an origin-only JavaScript probe.
That setting was left unchanged; no token, customer response or browser storage
value was extracted and no staff API request was sent by the agent. A signed-in
session being present is not a passing authenticated API check.

The owner was given a one-time local Console checker for exactly `GET /api/v1/auth/me`
then `GET /api/v1/orders?status=DELIVERED&page=1`. It keeps the token and response
bodies in Safari, returns only status/schema booleans, refuses a wrong origin or
missing/expired/non-staff session, and stops on the first failure without retrying.
Eleven serial mocked cases passed, including success/empty lists, origin/session
guards, HTTP/schema/network failures and output-leak rejection. No live request was
used by those tests. This is a temporary diagnostic, not application code or a new
verification system. Until its sanitized result is returned, both staff checks
remain **PENDING**, not passed; no re-login, token copying or security-setting change
is requested. Successful API/dispatcher health and runtime configuration above
remain valid independent evidence. All four gates stay false.

### Historical correction attempts (superseded by the initial-key update above)

**Earlier execution, 2026-10-27:** Robert reported "Saved; existing key preserved."
The existing approval was used for only speedy-api redeploy
`dep-dbg38ld9fdbs73cl4gag`, source
`4ac2ba372ae23972ee665a77ce241c3d267ea107`, live at
`2026-10-27T05:20:26.657456Z`. Main/source and API Auto-Deploy Off were checked
before triggering; no secret value was retrieved or changed by the agent. The
existing build -> `npx prisma migrate deploy` -> start lifecycle was preserved.
Logs identify Node 24.22.1, successful build, **no pending migrations to apply**
at `05:19:55.957935552Z`, then pre-deploy completion at `05:20:00.548970081Z`.

Post-redeploy read-only checks: liveness/readiness HTTP 200 with database `ok`;
privacy admin GET HTTP 503 / `PRIVACY_SERVICE_UNAVAILABLE` / `no-store`;
48 completed migrations, zero unresolved, four enabled protection triggers,
all six privacy tables and erased-order state empty. No error-level log entries
were returned in the observed post-live window. Unchanged schema/application CI
was reused; no application changes, local builds/tests, simulator or new migrations.

This is **not yet a passing runtime-configuration result**. A newly opened Shell
session must run the existing sanitized command below after this deployment;
retain the earlier failed result as history. Dispatcher remains unchanged at
`dep-dbg2mgkipgvc73ease2g` / the same SHA, with no further action until the API
configuration passes. Cron remains `dep-dbg083uk1f9s73aunkd0` / `c5f249f` without
a deploy/run; ordering staging/SMS are untouched. Auto-Deploy independently remains
Off on all three production services. No code/secret rotation, production mutation
smoke test, website publication or app-store action occurred.

**Historical owner-provided failed runtime result, 2026-10-27:** Shell identified the
expected `4ac2ba372ae23972ee665a77ce241c3d267ea107` and
`allFourGatesExactlyFalse=true`, but returned `false` for
`dedicatedDigestKeyPresent`, `digestKeyDistinctFromJWT`, `adminMatches`,
`policyMatches`, `timeframeMatches` and `fiscalYearMatches`. Configuration closeout
has therefore **failed**, not passed or merely pending. The key-presence probe
also requires length >=32; its false result alone cannot distinguish an absent,
empty or short value. The second boolean also cannot alone establish whether a
key is absent/empty or equals JWT. No secret was retrieved; no cause is guessed.

The dispatcher had already become live before this asynchronous result arrived.
That deployment is recorded below, not described as paused before it occurred.
The targeted API correction/redeploy is now recorded above; further dispatcher
action remains paused pending a passing fresh API runtime-configuration read-back.
Keep all four gates false and Auto-Deploy Off; no rollback, key rotation, application
change, migration retry or data mutation is authorized by this correction step.

Historical Dashboard correction instructions (not a new action request): open ONLY speedy-api
`srv-d7ntlnpkh4rs73bev9q0` -> Environment. Confirm exact key names and separate
single-line values. Correct only the admin, policy, timeframe and fiscal rows to
the approved values in the configuration section below. Preserve all four already
false gates and unrelated settings. Inspect `PRIVACY_DIGEST_KEY` privately: leave
an existing nonempty value untouched; if the exact row is missing, restore the
same already-securely-retained key under that exact name, not a new generated key.
If a malformed/misnamed entry holds that original key, preserve the value while
correcting its association. If the existing key is short/reuses JWT, its origin is
uncertain, or the retained original cannot be recovered, report only that category
and stop before replacing it. Choose **Save only**; no secret file/environment
group change, dispatcher setting change or automatic deployment.

Robert's saved confirmation and execution above used the existing approval for an
API redeploy of exactly `4ac2ba372ae23972ee665a77ce241c3d267ea107`. Recheck source,
Auto-Deploy and the migration state; preserve build -> migrate deploy -> start.
Require a fresh Shell/session read-back after it becomes live, all original checks
passing plus read-only health/disabled-route checks, before any further dispatcher
action. The dispatcher already runs that SHA; no repeat dispatcher build is needed
solely to apply API-only settings. Record its verification only after API closure.

Robert approved exact review head `d8291bbba745fbac62e0ff25816e51dd384d4b87`
against `c5f249fc079f2faa5ff99c61b193a0626eccc3aa`, then confirmed privately saved
configuration before execution. PR 93 was marked ready and merged as
**`4ac2ba372ae23972ee665a77ce241c3d267ea107`**, with precisely those two parents.
Only the API and dispatcher were manually deployed, in that order:

| Service | Deployment | Live at (UTC) |
| --- | --- | --- |
| speedy-api | `dep-dbg2lf4ipgvc73eapitg` | `2026-10-27T04:39:20.047361Z` |
| speedy-dispatcher | `dep-dbg2mgkipgvc73ease2g` | `2026-10-27T04:41:20.189964Z` |

Both live deploy records identify the merge SHA above. The dispatcher deploy was
triggered only after API health, schema/protection and disabled-route checks passed.
Auto-Deploy was independently rechecked **Off** on API, dispatcher and retention
cron. Cron remains on `c5f249f` / `dep-dbg083uk1f9s73aunkd0`; no cron deploy/run,
schedule change, ordering-staging or SMS-resource change was performed.

Final readiness and evidence:

- Fetched refs matched the approved source/baseline; existing local untracked work
  was preserved. Changes since tested `b3d6b1280f41770ab951aa7086c678b23c59fda9`
  affected only this document and `docs/release-checklist.md`. Reused successful
  `validate`/`privacy-database` in [PR CI 40438700778](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40438700778)
  and [push CI 40438694962](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40438694962).
  The documentation-only approved head used `[skip ci]`; no new test result is
  attributed to it. GitHub reported main protection disabled and no repository
  rulesets; no required check was bypassed. No local build/simulator/test rerun.
  GitHub subsequently ran the normal merge-push workflow automatically: both
  `validate` and `privacy-database` passed on exact deployed merge `4ac2ba3` in
  [CI 40450819956](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40450819956).
  This was platform-triggered CI, not a requested repeat of the unchanged suites.
- Exact production database `dpg-d7m33g2qqhas73f58hrg-a` / `speedy_sweeties_db`
  had 44 completed migrations, no unresolved migration or privacy objects, and the
  approved administrator was active immediately before merge.
- Robert confirmed all eight non-secret saved values in the configuration section
  match exactly, including **all four gates `false`**, admin allowlist, policy,
  normal 30-day timeframe and fiscal `12-31`. He confirmed the dedicated stable
  `PRIVACY_DIGEST_KEY` is present and securely retained. No secret was requested,
  printed or rotated; no synthetic setting was copied. Existing settings were
  preserved. This was **owner-observed saved-configuration evidence**. The later
  running-Shell result above supersedes it for runtime readiness: four flags pass,
  but key/admin/policy/timeframe/fiscal checks fail and require targeted correction.
- API commands remained build `npm ci --include=dev && node ./node_modules/prisma/build/index.js generate && npm run build`
  → pre-deploy `npx prisma migrate deploy` → start `npm run start`.
  Build logs identify Node 24.22.1 on both services. All four privacy migrations
  finished successfully in order at `04:39:00.436938Z`, `04:39:00.630618Z`,
  `04:39:00.644491Z` and `04:39:00.658318Z`, respectively, on 2026-10-27 UTC.
  Logs then record pre-deploy completion at `04:39:06.427139075Z` and application
  start at `04:39:13.037995081Z`. No migration was manually marked successful.
- Read-only database verification: **48 completed migrations, zero unresolved**;
  all six privacy tables and all **64 privacy-table scalar columns**, types and
  nullability match reviewed Prisma source. Added Customer/Order/receipt columns,
  deadline/review fields and all four enabled protection triggers were verified:
  `privacy_retained_order_guard`, `privacy_receipt_guard`, `privacy_item_guard`,
  `privacy_help_guard`. All six privacy tables and erased-order state were empty.
  Production protection was inspected, not exercised by a destructive write;
  financial-evidence/anti-reactivation behavior retains the passing synthetic CI.
- API live/ready both HTTP 200, readiness database `ok`. Disabled admin privacy GET
  returned HTTP 503 / `PRIVACY_SERVICE_UNAVAILABLE` / `Cache-Control: no-store`.
  The documented all-zero synthetic tracking ID returned the normal HTTP 404.
  Dispatcher page and referenced JavaScript asset returned HTTP 200; API health
  passed again afterward. Recent service error-level log queries returned no entries
  in the observed post-start windows; this is not a claim about all historical logs.
- Existing-session staff/dispatcher authenticated reads were **unavailable** through
  connected access, not passed. No login/password reset, AI help, loyalty GET,
  order write, verification code, message or deletion was invoked. No iOS rebuild,
  website publication or store action. In-app verification and actual fulfillment
  remain pending; this rollout does not complete account-deletion launch readiness.

No rollback was needed. The documented boundary below remains: do not reverse
migrations/drop objects; pre-privacy code rollback only after a fresh read-only
proof of no real privacy state. Preserve the digest key and all protection state.
The completed recovery exercise remains **QUALIFIED**, with cleanup confirmed and
the separate production enum-order assessment non-blocking; no new copy was created.

Next: complete existing-session staff reads when available and final website/provider prerequisites
before separately approved initiation/channel activation and the controlled iOS
flow. All gates remain off; Apple case `103005572330` and Android deferral remain.

### Retained runtime read-back command (passed above; no repeat needed)

Open only [speedy-api Shell](https://dashboard.render.com/web/srv-d7ntlnpkh4rs73bev9q0/shell)
and run the following. It returns the public commit identifier and booleans, never
secret values. Expect commit `4ac2ba372ae23972ee665a77ce241c3d267ea107` and all
booleans `true`. Report only this sanitized output; never use `env`, `printenv`,
credential screenshots or a full environment dump. A false result is a specific
configuration discrepancy to investigate, not permission to rotate the key or
activate a gate. This probe does not prove key backup/recovery storage; that remains
Robert's separately recorded secure-retention confirmation.

```sh
node -e 'const e=process.env;const gates=["PRIVACY_DELETION_ENABLED","PRIVACY_FULFILLMENT_ENABLED","PRIVACY_VERIFICATION_EMAIL_ENABLED","PRIVACY_VERIFICATION_PHONE_ENABLED"];console.log(JSON.stringify({commit:e.RENDER_GIT_COMMIT,allFourGatesExactlyFalse:gates.every(k=>e[k]==="false"),dedicatedDigestKeyPresent:typeof e.PRIVACY_DIGEST_KEY==="string"&&e.PRIVACY_DIGEST_KEY.length>=32,digestKeyDistinctFromJWT:!!e.PRIVACY_DIGEST_KEY&&e.PRIVACY_DIGEST_KEY!==e.JWT_SECRET,adminMatches:e.PRIVACY_ADMIN_USER_IDS==="afca21ae-4c43-4c14-a2a7-f3ad790b12dc",policyMatches:e.PRIVACY_APPROVED_RETENTION_POLICY==="SS-RETENTION-2026-10-23",timeframeMatches:e.PRIVACY_COMPLETION_TIMEFRAME==="Normally within 30 calendar days after verification; an ownership conflict or legal hold may require longer.",fiscalYearMatches:e.PRIVACY_FISCAL_YEAR_END_MM_DD==="12-31"},null,2));'
```

## Confirmed configuration facts

- Approved fiscal year-end: December 31. The review branch records
  `PRIVACY_FISCAL_YEAR_END_MM_DD=12-31`; fulfillment rejects another value.
- Production has one active `ADMIN` row. Its allowlist value is
  `afca21ae-4c43-4c14-a2a7-f3ad790b12dc` (`admin@speedysweeties.ca`). Read it back
  immediately before rollout in case staff records change.
- Confirmed privacy contact: Robert Stubbings, `speedysweeties@hotmail.com`,
  `519-826-8097`.
- The live API and dispatcher now use PR 93's merge `4ac2ba372ae23972ee665a77ce241c3d267ea107`,
  which includes security PR 96's `c5f249fc079f2faa5ff99c61b193a0626eccc3aa`.
  The earlier security runtime/certificate items are closed
  on Robert's owner-provided Shell evidence in `docs/production-security-maintenance.md`;
  cron evidence remains build-only. Auto-Deploy is Off for all three. The
  privacy routes/migrations are deployed with initiation/delivery/fulfillment
  disabled. Passing owner-provided runtime evidence and its limits are above.
- The production 90-day retention cron remains a marketing `DRY_RUN`. Read-only
  logs on 2026-10-23 reported `SMS messages sent: 0`; it is not an inactive-profile
  deletion or privacy-expiry worker.

## Providers and logs

- Resend is demonstrably configured for the existing B&D operational-email feature:
  its database toggle is enabled and 60 provider-accepted receipts existed, most
  recently 2026-10-23. This establishes neither a privacy-verification sender/domain
  nor Resend deletion, retention, location or inbox-delivery outcomes. Those remain
  separate account/dashboard checks before enabling privacy email.
- The existing instrumented Twilio integration is now deployed but production
  privacy flags remain disabled. Robert confirmed the Speedy Sweeties Verify service, SMS enabled with
  Fraud Guard Standard, and Canada SMS & RCS Geo Permission `Allow All Traffic`.
  An earlier isolated Verification was accepted HTTP 201/pending but became
  `undelivered`, numeric error `30007`, on Canada/Telus. On 2026-10-26, Twilio support
  reported that its carrier partner identified a false positive and remediated it.
  Robert then reported a separately authorized controlled-client retest with one SMS
  attempt, approved Verify check, source-bound submitted request, recorded due date,
  rejected fulfillment with unchanged records and final cancellation. A sanitized
  Render log corroborates the Verify start as accepted HTTP 201 at
  `2026-10-26T16:50:31.573Z`; the successful check and later lifecycle results are
  owner-provided client evidence because those success paths are not logged. This is
  not an iOS in-app or production activation test. Keep production phone verification
  disabled until staged activation is explicitly approved.
- Twilio pricing/taxes, spend controls and privacy/retention/location terms remain
  account checks. The Render read API still does not expose secret values, and no
  credential value was read or printed.
- No live API log matched `privacy`, `Twilio` or `Resend` in the inspected seven-day
  window. This is consistent with the undeployed privacy branch but is not proof of
  a provider-retention practice.
- Render log retention depends on the workspace plan (currently documented as 7,
  14 or 30 days). The connector does not expose the workspace plan or log-stream
  configuration. Six-day-old cron logs were readable; 13-day-old cron logs were not.
  That observation does not justify publishing an exact retention claim. Confirm the
  Billing plan and any external log streams in the Render Dashboard.

## Database, backups and restore

- Production is an available Render PostgreSQL 18 instance on paid database plan
  `basic_256mb`, with 1 GB storage, no read replica, no high availability and no
  connection pool. The staging database is separate and free.
- Read-only inventory on 2026-10-26 independently identifies production as
  `dpg-d7m33g2qqhas73f58hrg-a`, database `speedy_sweeties_db`, in workspace
  `tea-d7loaul7vvec73cme5d0`, Ohio. At `2026-10-26T21:49:13.659195Z` SQL reported
  25 MB, latest completed migration `20261022170000_bnd_waiting_history`, zero
  privacy migration entries and zero privacy tables. The sole active ADMIN ID
  above was rechecked. These are availability/schema facts, not backup evidence.
- Robert inspected this exact production database's Recovery page on 2026-10-26:
  **PITR allows restoration from the past three days**, and the page states logical
  exports are retained for **at least seven days**. These are owner-observed account
  facts, not assumed plan defaults. No existing export, exact selectable timestamp
  or successful restore was shown in that initial inspection. The configured window
  is known. The later approved copy/read-only result is recorded below; the export
  inventory and other selectable recovery points remain unverified.
- The Render connector exposes no recovery/export read operation. No authenticated
  CLI/API session was available, and read-only browser access did not succeed. No
  account secret was sought or displayed. This remaining access gap does not negate
  Robert's observations or establish that the export inventory is empty.
- The documented read-only REST operations are
  `GET /v1/postgres/dpg-d7m33g2qqhas73f58hrg-a/recovery` (`recoveryStatus`, `startsAt`)
  and `GET /v1/postgres/dpg-d7m33g2qqhas73f58hrg-a/export` (export ID/date and a
  sensitive download URL). They require authenticated access not supplied by this
  connector. If used later, retain only status/timestamps/counts; suppress download
  URLs and credentials. No export creation or recovery was triggered by that initial
  read-only investigation; the later authorized recovery copy is recorded below.
- No backup cron/service, `pg_dump`, S3 backup workflow or other independent backup
  automation is present in the connected Render resources or repository. This does
  not prove that a manually created export or external process does not exist.
- The remaining Dashboard fields are specified below; do not ask Robert to reconfirm
  the three-day window. If an export is listed, record only its date/status, not its
  download URL. No export creation or download is needed for the proposed PITR test.
- Before this rehearsal, no completed non-production backup-restore evidence was
  found in repository docs, tests, history, iOS release handoffs or the targeted
  Render/recovery mailbox search.
  `privacyDeletion.database.test.js` tests transaction rollback and anti-reactivation;
  `preparePrivacyRenderDatabase.cjs` rebuilds a synthetic baseline. Neither proves
  recovery from a backup. The subsequently executed protected rehearsal below has
  a **qualified** result, not an unconditional schema-equivalence pass.

## Owner-approved protected PITR rehearsal — 2026-10-26

This update supersedes the older proposal's price ceiling and pending-approval
language. Robert approved one temporary recovery copy at **US$6.30/month including
storage, prorated**, restricted access, read-only verification and deletion, with a
maximum lifetime of 24 hours. No repeat approval is needed for that same scope.

- Exact clone: `dpg-dbg14b59el5s73bj1sm0-a`,
  `speedy-privacy-restore-rehearsal-20261026`, database `speedy_sweeties_db_fxnr`,
  workspace `tea-d7loaul7vvec73cme5d0`; Ohio, PostgreSQL 18, `0.1c-256mb`, 1 GB.
- Owner-selected restore point: `2026-10-26T21:45:00Z`. Before cleanup, the resource
  API confirmed Available, creation at `2026-10-27T02:53:32.568628Z`, no HA, replicas,
  pool or storage autoscaling. Recovery-source/time selection is owner-provided
  evidence; this resource-detail API does not expose those fields.
- Owner deadline: **2026-10-27 22:53 Toronto / 2026-10-28T02:53:00Z**, slightly
  earlier than 24 hours after the API creation timestamp. Delete immediately after
  checks or an unresolved blocker, not at the deadline by default.
- The empty external IP allowlist was independently read back. Robert's screenshot
  says all internet traffic is blocked. The hosted connector cannot reach the
  restricted copy and has no fixed address to allow; no hosted SQL check succeeded.
- The Mac's current public IPv4 was confirmed by two independent HTTPS endpoints.
  Robert saved only that address as `/32` on this clone, independently read back as
  exactly one matching entry. No broad rule, source or workspace rule was changed.
  The address itself is deliberately omitted from committed evidence.
- Existing checkout/database client only: installed Prisma 6.19.3; no `psql` binary
  was found in the inspected installed-tool locations. No package installation,
  build, simulator, application import/startup, migration, seed or reset is needed.
  The bounded local checker uses a hidden terminal URL prompt and rejects any
  hostname/database other than this clone. Credentials stay in process memory/IPC,
  never command arguments, files, logs or chat. It uses one TLS connection with
  strict certificate checking, default read-only sessions and a REPEATABLE READ
  READ ONLY transaction, 15-second statement and two-second lock timeouts, then
  rolls back/disconnects. Raw client errors/output are suppressed.
- Preparation checks passed without opening a database connection: eight wrong-
  target/unsafe-URL rejections, syntax, and pinned-source inventory (44 migrations,
  24 application tables, 296 scalar columns, 13 enums, 80 named indexes and 21
  migration-defined foreign keys). This is preparation evidence, not a restore pass.
- SQL verification completed with the qualified result below. Cleanup is confirmed
  by owner Dashboard deletion and independent API/inventory read-back. No customer
  fields, financial totals, receipt text, dump or connection string were retained;
  only sanitized metadata/counts/pass-fail results belong here.
- The first owner-run local attempt stopped with the generic target/URL rejection
  before opening a connection. No SQL result file existed at that point. Its original
  failing rule cannot be recovered because the private input and per-rule diagnostics
  were intentionally not retained; do not guess that the hostname or database was
  wrong or mark restoration verified.
- A synthetic reproduction found a hidden-input defect: bracketed-paste markers
  split across TTY chunks could become literal URL text and fail URL-format
  validation. This is an evidenced defect, not proof of the original attempt's
  cause. The temporary PITR checker now carries paste/control sequences across
  chunks and has fixed, non-secret per-rule labels plus a `--check-input` mode that
  never opens a database connection, even on input PASS. The exact clone hostname,
  database, port, TLS and option guards remain; no hostname alias, wildcard or
  bypass was added. Shared SMS tooling and application source were left unchanged.
- Verification of that local-only correction passed 21 focused tests and two
  real-PTY no-echo checks using synthetic inputs. Tests included every split of
  the bracketed-paste sequence, multiline/control rejection, editing/cancellation,
  and production/staging/SMS/wrong-database target rejection. No live credentials,
  provider calls or database connections were involved. Robert subsequently reported
  input PASS, corroborated by the sanitized input-only report at
  `2026-10-27T03:50:42.743Z`; `databaseConnectionOpened=false`. That input result alone
  was not treated as a recovery-verification pass.

### Executed read-only result — qualified; cleanup confirmed 2026-10-27

Robert ran the prepared checker privately. Its sanitized report records
`2026-10-27T03:52:24.397Z` through `2026-10-27T03:52:27.885Z` (October 26,
23:52 Toronto), 3.488 seconds. The exact clone hostname/database guards passed;
independent resource read-back matched the ID, name, workspace, database, Ohio,
PostgreSQL 18, 1 GB and sole approved Mac `/32`. The source comparison remains
`7bcaaf7cfff6f8e45ab0b912f35d61ffd56c7e39`, not a moving production count baseline.

- Session: PostgreSQL `18.6 (Debian 18.6-1.pgdg12+2)`, TLS true, read-only on,
  repeatable read, 15-second statement timeout and two-second lock timeout.
  The same connection was confirmed at the end; the transaction was rolled back
  and the client disconnected. No application startup or record mutation occurred.
- Migrations: all **44** expected entries completed, zero missing/unexpected,
  unresolved or checksum mismatches. Seven match the pinned SQL only after the
  already documented CRLF line-ending equivalence. One historical rolled-back
  attempt has its successful completion; none remains without completion. Latest
  expected migration is `20261022170000_bnd_waiting_history`.
- Tables/columns: all **24 application tables plus `_prisma_migrations`**, all
  **296 expected scalar columns**, matching checked types/nullability/native
  precision, no missing/unexpected tables or application columns, no privacy tables.
- Indexes/relationships: all **80 migration-parser-defined named indexes** and
  expected primary keys match; all **127** observed indexes are valid/ready.
  All **21 migration-parser-defined foreign keys** match; all **24** observed
  foreign keys are validated. The parser inventories are subsets, not proof of
  exact equivalence for every extra index/constraint. No tested orphan join exists.
- Enums: **13 expected / 13 observed; one ordered-label comparison differs**.
  The checker retained only the mismatch count, not the enum name/labels. It cannot
  distinguish a label difference from order-only drift from this report. Do not
  infer restore corruption, waive the discrepancy, or call the full schema check
  passed. The separate fresh-production compatibility assessment below does not
  establish the deleted clone's exact mismatch or change this historical result.
  No repair, migration, extra clone or automatic rerun was performed.

| Sanitized aggregate | Restored count | Verification |
| --- | ---: | --- |
| Customers | 560 | Order-to-customer orphan count 0 |
| Orders | 5,717 | All 5,717 original order-text values readable server-side |
| Order items | 9,886 | All amount expressions/descriptions readable; required-evidence gaps 0; orphan count 0 |
| Digital receipts | 5,137 | All amount expressions/notes readable; required-evidence gaps 0; orphan count 0 |
| Staff records | 10 | Count only; no account details returned |

These checks establish a usable restored dataset and financial-field readability,
not exact point-in-time row completeness, financial formula correctness, a full
application exercise, or later privacy-decision reconciliation. No current-versus-
snapshot count difference was used to assert restore loss. Receipt notes and item
descriptions remained in the database; neither content nor content hashes left it.

The original result remains **QUALIFIED**, not PASS. Sanitized evidence fingerprints
from the report (SHA-256):

- Migration metadata: `af313dbf3e6df861e112b7a38a45f35a64c816a47bd381213cd1d64f3c91885c`.
- Pinned source schema: `f30f7b7d21e1f19109f4f7ad9c69507050fe27339064db2115ca114a43a35091`.
- Restored column metadata: `fe970e902c45676e94333ba333625cc81a72ca7d42269b21bcab6c09256f7f22`.
- Restored index metadata: `cbf44e1d10e9419bc0f833b684a379a68f11690691bd206427a64acdf902837f`.
- Original sanitized result file: `6f7714521a053f9bbb8ea61c8cd127223c1aefb25a7fc848f51e6c2897caeb99`.
- Temporary checker used for this run: `fd2f6be1ab35ccb705e308f8493da1f948582c13d077baf94465fb7a4bd23d80`.

Robert reported deletion of only `dpg-dbg14b59el5s73bj1sm0-a` through its Dashboard
**Delete Database** action. The connector has no PostgreSQL deletion operation;
the deletion itself is owner-performed. Independent verification completed by
`2026-10-27T04:01:22Z` (**October 27, 00:01 Toronto**):

- Exact-resource lookup returns **HTTP 404**.
- Workspace `tea-d7loaul7vvec73cme5d0` database inventory contains only the existing
  production `dpg-d7m33g2qqhas73f58hrg-a`, ordering staging
  `dpg-davbqnhsrm7s73bd3uq0-a` and SMS-test `dpg-dbe37v59fdbs73961o3g-a` databases,
  all **Available**. The recovery resource/name is absent; no replacement was made.
- Removal was verified less than 68 minutes after API creation, well before the
  maximum 24-hour lifetime/deadline. This is the verification time, not an invented
  exact deletion timestamp. No active recovery-copy database remains to incur
  further instance charges; the actual prorated invoice/amount was not observed.
- No additional resource, application attachment, export or customer-data dump was
  created in this rehearsal. Source, ordering staging and SMS resources were not
  modified by the verification/cleanup workflow. No claim of immediate physical
  erasure or provider backup expiry follows merely from resource removal.

**Cleanup is closed; the read-only result remains QUALIFIED.** Preserve the
sanitized evidence above. The deleted clone's exact enum discrepancy cannot now be
proven; deletion neither resolves it nor proves data loss. The fresh-production
assessment below is separate evidence. Do not recreate the copy or treat this
closeout as approval for another paid resource, a production migration or deployment.

### Fresh production enum assessment — 2026-10-27

**Conclusion: the observed production `OrderStatus` ordering difference does not
block PR 93's planned deployment with all four privacy gates false.** No dependency
on its PostgreSQL sort order was found in the reviewed production/PR code or four
privacy migrations. No enum reorder, replacement type, corrective migration or
application change is warranted by this finding. This is a bounded compatibility
assessment, not an unconditional restoration pass or deployment authorization.

Evidence is deliberately separated:

- Robert supplied a fresh read-only production inspection: all **13 enum names and
  label sets** match pinned source `7bcaaf7cfff6f8e45ab0b912f35d61ffd56c7e39`; only
  `OrderStatus` order differs. No production SQL was repeated for this assessment,
  and the supplied observation has no retained query timestamp in this report.
- Source order: `PLACED, DISPATCHED, ACCEPTED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED`.
  Observed production order: `PLACED, ACCEPTED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED, DISPATCHED`.
- Read-only Render deployment metadata still identifies API, dispatcher and cron
  builds as `c5f249fc079f2faa5ff99c61b193a0626eccc3aa` (latest deploy status `live`).
  This confirms the code baseline, not a new health/certificate test or cron run.
  Fetched main matches that SHA; draft/unmerged PR 93 started this assessment at
  cleanup commit `1815085301233464361129f85fdb084491deb664`.
- Local source comparison confirms all 13 enum declarations, including their order,
  are identical at the pinned source, current production source and PR review head.
  Production's ordering therefore is not introduced by PR 93. Its historical cause
  is not established here. The deleted copy's saved mismatch count cannot be
  retrospectively identified as this same `OrderStatus` difference.

PostgreSQL enum order matters for enum sorting, range comparisons and `MIN`/`MAX`;
equal label sets alone would not prove compatibility if those operations were used.
See [PostgreSQL 18 enum ordering](https://www.postgresql.org/docs/18/datatype-enum.html#DATATYPE-ENUM-ORDERING).
The scoped source review covered `orderStatus`/`cancelledFromStatus`, Prisma
`orderBy`/range/aggregate inputs, raw SQL, enum-catalog helpers, application sorting,
and the production-to-PR diff. Results:

| Area and source | Actual dependency / conclusion |
| --- | --- |
| `src/controllers/orderList.controller.ts`, `driverOrders.controller.ts`; `speedy-dispatcher/src/App.tsx` | Database order lists sort by timestamps/IDs, not status. Active-order priority is explicitly HIGH before NORMAL, then oldest; history uses timestamps. This is an application priority map, not `OrderStatus` ordinal order. |
| `src/services/orderStateTransition.service.ts`; assignment, driver-action, receipt and stats controllers | Named-label equality, `in`/`notIn`, sets and explicit transition pairs. Optimistic update guards match the existing label. Stats arrays pair explicit labels with their counts; no database ordinal lookup or range is used. |
| Raw queries in `undispatchedOrderAlert.service.ts`, `autoDispatchPickupPlan.service.ts`, `receipt.controller.ts`, `deliveryCheckIn.routes.ts` | Status selection/equality or row locks. Alert ordering uses creation time/ID. The delivery report's `MIN` is on `deliveredAt`, not the enum. No enum `ORDER BY`, range, `MIN`/`MAX`, or `enum_first`/`enum_last`/`enum_range` dependency was found. |
| `privacyDeletion.service.ts`, `privacyGuards.service.ts`, `privacy.routes.ts` | Active-order hold is `!['DELIVERED', 'CANCELLED'].includes(orderStatus)`, so DISPATCHED remains active in either order. Subject orders sort by ID; source lookup by creation time/ID. Anti-reactivation uses identity digests, not status order. Request lifecycle states are TEXT and explicit labels, separate from `OrderStatus`. |
| Four `20261023*` privacy migrations | No `OrderStatus` alteration, cast, comparison or ordinal assertion. Added fields/tables/indexes and retained-record triggers depend on IDs and `privacyErasedAt`. Due-date backfill uses request creation time. Existing status labels/columns/indexes are left intact. |

The API's documented pre-deploy command remains **`npx prisma migrate deploy`**
with the locked Prisma 6 version, not `npm run prisma:migrate` (which invokes the
development-only `migrate dev`), `db push`, or synthetic baseline/reset tooling.
It applies pending migration files; it does not regenerate SQL to reconcile enum
declaration order or detect general schema drift. Applied historical migrations
must not be replayed or edited. See [Prisma 6 production migration behavior](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production#production-and-testing-environments).
Keep the four ordered migrations before application start; gates-off ordinary
order writes still require the privacy identity tables. The production schema/
migration and private configuration read-back remains a pre-deployment requirement.

Validation was source inspection plus local enum-declaration comparison and diff
checks only. Application, migrations, dependencies and test tooling are unchanged
from the exact CI-tested documentation head `b3d6b1280f41770ab951aa7086c678b23c59fda9`
(both jobs passed in PR run `40438700778` / push run `40438694962`). Reuse that
combined evidence; it is not relabelled as a test of the production enum ordering.
No concrete order-dependent behavior was found to justify another application
test, database exercise, build or simulator run. No customer values were inspected.

**Deployment implication:** this enum finding is not a remaining technical blocker
for the proposed gates-off rollout, which still needs separate approval. Preserve
the original recovery report as **QUALIFIED**, its readability passes and confirmed cleanup. No new clone
is needed for this enum assessment. Full workflow restoration and post-snapshot
privacy-decision reconciliation remain unproven and still gate later fulfillment
activation. A future change that sorts/ranges/aggregates this enum must explicitly
review its database order or use a deliberate application/SQL priority mapping.
Next: obtain the separate PR 93 merge/gates-off rollout approval under the existing
configuration, ordered migration, read-only smoke and rollback plan; this assessment
does not authorize execution or reopen approved retention/contact decisions.

## Original protected PITR proposal and verification plan (historical approval state)

The approval, exact created resource and US$6.30 total above supersede the old
pre-creation instructions below. The read-only checks and cleanup safeguards remain
applicable. Do not create another copy or ask again for the already approved scope.

The current request is **create, restrict, read-only verify, then delete one clone**.
It does not authorize migration/seed/reset commands, an application deployment,
production writes, or attachment of any service to copied customer records.

### Exact proposed target and Dashboard confirmation

- Source: `dpg-d7m33g2qqhas73f58hrg-a` / `speedy-sweeties-db` only.
- Proposed restore timestamp: **2026-10-26T21:45:00Z**, October 26 at **5:45 p.m.
  Toronto (EDT, UTC-04:00)**. It is older than ten minutes and within the observed
  three-day window at preparation time. Its acceptance by Render's selector has
  **not** been verified. Record the selector's timezone and accepted UTC value; if
  unavailable or expired, stop and obtain approval for a replacement, not silently
  substitute another time.
- New display name: `speedy-privacy-restore-rehearsal-20261026`; workspace
  `tea-d7loaul7vvec73cme5d0`, Ohio, PostgreSQL 18, Basic-256mb/current
  `0.1c-256mb`, 1 GB storage, storage autoscaling off, no HA, replica or pool.
  Select Copy Existing Settings **No**; attach no project environment, environment
  group, Datadog integration, application, worker, scheduled job or messaging system.
- The new resource ID/host are assigned on creation and must differ from source,
  ordering staging `dpg-davbqnhsrm7s73bd3uq0-a`, and SMS database
  `dpg-dbe37v59fdbs73961o3g-a`. Never change those resources or SMS service
  `srv-dbe3861srm7s73dgfe50`. A restored database name may equal the source name;
  **name equality is not target verification**. Match the new Render ID/host,
  workspace, region and recovery-source/timestamp metadata before connecting.
- Public compute pricing suggests US$6/month for this size; it is **not this
  account's displayed quote**. The restore form must confirm compute, 1 GB storage
  and total recurring cost, prorating and any additional charge. Proposed approval
  ceiling: **US$6/month total resource charge including storage, prorated, no other
  paid resource**, maximum lifetime 24 hours. If the displayed total exceeds that
  ceiling, do not create; return the exact quote for a revised approval. The earlier
  SMS-resource authorization does not authorize this new protected copy.

Robert's exact screen: open [production database](https://dashboard.render.com/d/dpg-d7m33g2qqhas73f58hrg-a)
→ **Recovery → Point-in-Time Recovery → Restore Database**. Enter the proposed name
and timestamp; choose **Copy Existing Settings: No** and, if offered, **Customize
Recovery** to inspect the settings/quote. Stop before the final **Start Recovery**
or other create/confirm action. Report only: accepted timestamp and displayed
timezone; selected plan; storage GB and its charge; compute charge; total recurring
charge/currency and any extra charge. Do not send connection strings, export links
or credentials. If no quote is visible without creating, stop and ask Render support
for it rather than provision to discover the price.

### Access, read-only verification and cleanup

1. Before creation, confirm an authorized Dashboard operator can both restrict and
   delete the clone. The current connector cannot update PostgreSQL access rules or
   delete the database, and authenticated browser access is unavailable. Robert must
   perform those steps or make an appropriate authorized session available; do not
   leave cleanup dependent on unavailable tooling.
2. Render PITR inherits the source external IP allowlist; source read-back is
   `0.0.0.0/0`. Immediately restrict **the new clone only**: deny all external access
   when the authorized internal read-only connector is sufficient, otherwise allow
   only the operator's verified current public IP as a `/32`, using TLS. This
   inherited broad-list interval cannot be claimed to be pre-restricted. Keep clone
   credentials private/unattached throughout; if immediate restriction is impossible,
   delete the clone and stop. Same-workspace private networking remains reachable;
   this is a separate authenticated resource, not a claim of network segmentation.
3. Wait for Available and confirm exact resource identity/recovery point again.
   Use database tools only, one connection at a time, in a `REPEATABLE READ READ
   ONLY` transaction with 15-second statement and two-second lock timeouts. Never
   start `src/server.ts` (its imports/startup include monitors and repairs), invoke
   Prisma migration/reset/seed commands, or run the SMS fixture tooling here.
4. Compare restored schema/migration metadata with pinned production source
   `7bcaaf7cfff6f8e45ab0b912f35d61ffd56c7e39`: expected final completed migration
   `20261022170000_bnd_waiting_history`; no unfinished migration or privacy objects
   expected at the chosen snapshot. Inspect only migration names/checksums/status,
   not migration error logs. Verify public tables, columns, types, indexes and
   validated foreign keys against that source; compare Customer, Order, OrderItem,
   DigitalReceipt and User aggregate counts and join integrity. No row values leave
   the database. Existing production is moving, so current count differences alone
   do not prove restore loss; report any unresolvable timing discrepancy honestly.
5. Verify financial fields are readable by server-side aggregate calculations over
   saved receipt amounts, item quantity/price, identifiers, original timestamps,
   descriptions and receipt notes. Do not rewrite/redact originals, publish financial
   totals, or assume stored totals must equal a recomputed formula. Example checks
   below return counts/booleans only. A missing or inconsistent record is a failed
   or qualified check, never permission to repair this copy or production.
6. Retain only source/clone IDs, timestamp, schema/migration fingerprints, aggregate
   counts, pass/fail results, elapsed time and quoted/actual resource charges. No
   local dump, customer fields, phone numbers, receipt text, credential, URL with
   credentials or export download link. This proves tested restoration/readability,
   not full business-workflow correctness or post-snapshot privacy reconciliation.
7. Delete **only the new clone ID** immediately after verification, immediately on
   an unresolved blocker, and in all cases within 24 hours of creation. On that
   clone's Dashboard Settings page use its delete-database action and confirm the
   exact name/ID; refresh the resource inventory to verify absence and record the
   deletion time. Confirm no separately billable clone resources remain. Deletion
   stops future instance charges, not charges already incurred; provider backup
   expiry is not a claim of immediate erasure. Never delete the source, staging or
   SMS resources. Create no additional reminder or scheduled job.

After independently verifying the clone ID and host, these representative queries
are safe read-only checks (prepared, **not run**). The schema inventory/migration
comparison above remains required; these queries do not replace it.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SELECT current_database(), current_setting('server_version'),
       current_setting('transaction_read_only');
SELECT migration_name, checksum, finished_at IS NOT NULL AS completed,
       rolled_back_at IS NOT NULL AS rolled_back
FROM "_prisma_migrations" ORDER BY migration_name;
SELECT count(*) AS foreign_keys,
       count(*) FILTER (WHERE NOT convalidated) AS unvalidated_foreign_keys
FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'public'::regnamespace;
SELECT (SELECT count(*) FROM "Customer") AS customers,
       (SELECT count(*) FROM "Order") AS orders,
       (SELECT count(*) FROM "OrderItem") AS items,
       (SELECT count(*) FROM "DigitalReceipt") AS receipts,
       (SELECT count(*) FROM "User") AS staff;
SELECT
  (SELECT count(*) FROM "Order" o LEFT JOIN "Customer" c ON c.id = o."customerId"
   WHERE o."customerId" IS NOT NULL AND c.id IS NULL) AS orphan_customers,
  (SELECT count(*) FROM "OrderItem" i LEFT JOIN "Order" o ON o.id = i."orderId"
   WHERE o.id IS NULL) AS orphan_items,
  (SELECT count(*) FROM "DigitalReceipt" r LEFT JOIN "Order" o ON o.id = r."orderId"
   WHERE o.id IS NULL) AS orphan_receipts;
SELECT count(*) AS receipts,
       count("itemTotal" + "deliveryCharge" + "taxOrFees" + "grandTotal")
         AS readable_amount_rows,
       count(*) FILTER (WHERE "receiptNumber" = '' OR "createdAt" IS NULL)
         AS missing_required_evidence,
       count(notes) AS note_rows, count(md5(notes)) AS readable_note_rows
FROM "DigitalReceipt";
SELECT count(*) AS items, count(quantity * price) AS readable_amount_rows,
       count(*) FILTER (WHERE name = '' OR "createdAt" IS NULL)
         AS missing_required_evidence,
       count(md5(name)) AS readable_description_rows
FROM "OrderItem";
SELECT count(*) AS orders, count(md5("itemsText")) AS readable_order_text_rows
FROM "Order";
ROLLBACK;
```

The `md5` expressions force the database to read text, including out-of-line values;
only counts are returned, never text or text hashes. These are readability checks,
not a cryptographic integrity comparison or a privacy transformation.

### Separate later work, outside this clone approval

- The prior migration rehearsal remains prepared, not executed: only with separate
  permission could a protected clone receive the four privacy migrations and
  pre/post financial checks. The current approval request is read-only after restore.
- Separately rehearse post-snapshot privacy reconciliation using **only synthetic
   data** in a PostgreSQL 18 loopback/container database on an ephemeral runner.
   Reuse `tests/privacyBaseline.cjs`, the existing fixture and mocked delivery from
   `tests/privacyDeletion.database.test.js`; keep its loopback/name guards intact.
   Take a `pg_dump --format=custom` snapshot before synthetic fulfillment; record a
   second post-fulfillment snapshot/checkpoint containing the deletion request,
   revocations, marker, erased financial rows, external tasks and audit decisions.
   Restore the old snapshot into an empty synthetic target with
   `pg_restore --exit-on-error --no-owner --no-privileges --single-transaction`.
   Keep the target offline while replaying/reconciling the newer decision through
   the existing service with mocked delivery. Assert that the profile stays erased,
   old access/tracking/loyalty credentials remain rejected, marker/key fingerprint
   and triggers survive, all required financial evidence is unchanged, and an
   unrelated synthetic identity still works. Never run the test's reset/seed phase
   over a restored dataset and call that a restore verification.
- The durable source and operator procedure for post-snapshot privacy decisions
   still need to be established before fulfillment activation. Restoring an old
   snapshot alone cannot reconstruct later decisions; no automatic replay system
   is claimed. The synthetic exercise must prove the chosen reconciliation procedure
   before it is used on real requests. A new ephemeral runner run requires available
   included CI minutes or separate cost approval; it needs no paid web service.
- Any separately authorized synthetic runner/snapshots also require prompt cleanup;
  they are not part of the one-clone request above.

This exercise uses the current [Render recovery documentation](https://render.com/docs/postgresql-backups)
and [recovery-status API](https://api-docs.render.com/reference/retrieve-postgres-recovery-info),
read on 2026-10-26. Provider documentation is not evidence that this account has a
particular usable recovery point. The three-day window and at-least-seven-day export
statement are owner-observed. The original proposal did not establish a restore or
account-specific quote; the later approved US$6.30/month copy and qualified read-only
result above supersede that historical status. Public price context:
[Render pricing](https://render.com/pricing).

## Exact production configuration checklist

Target only `speedy-api` (`srv-d7ntlnpkh4rs73bev9q0`). Robert privately saved and
confirmed this configuration for the approved rollout above. The connector did
not retrieve secret values; preserve the saved values and their evidence attribution.

### Startup and ordinary ordering with privacy disabled

- Preserve existing `DATABASE_URL`, `JWT_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`,
  `NODE_ENV=production`, `CORS_ORIGIN` and Render's port. The first three are required
  by `src/config/env.ts`; production also requires CORS, and Firebase initialization
  parses/validates its service-account JSON. Do not rotate the existing JWT or copy
  synthetic secrets. Preserve all unrelated provider/dispatch/background-job settings.
- Preserve the deployed PR 96 Node 24.22.1 source pins and exact-version build
  guards. API/dispatcher runtime and CA verification passed on owner-provided Shell
  evidence; see `docs/production-security-maintenance.md`. `NODE_VERSION` remains
  absent; do not add the old proposed override. The security commit is integrated
  into this review branch; require its own combined CI evidence before a privacy
  rollout, rather than relying on the security-only or older privacy results.
- Apply all four migrations before startup. Ordinary create/update calls
  `assertPrivacyOrderAllowed` even with the public gates off. The health endpoint's
  `SELECT 1` alone does **not** prove these tables/triggers exist.
- Set these exact string values; channel and route code compare with `"true"`:

  ```dotenv
  PRIVACY_DELETION_ENABLED=false
  PRIVACY_FULFILLMENT_ENABLED=false
  PRIVACY_VERIFICATION_EMAIL_ENABLED=false
  PRIVACY_VERIFICATION_PHONE_ENABLED=false
  ```

- `PRIVACY_DIGEST_KEY`: privately generate/store a dedicated stable random secret
  (recommended 32 random bytes, encoded as 64 hex characters). Never print it.
  Configure it before any privacy state is created and preserve it for recovery.
  The code falls back to `JWT_SECRET` whenever the dedicated key is absent; an empty
  marker table does not reject that fallback. The dedicated key is a rollout
  requirement, not an unconditional
  startup requirement. A mismatched existing marker fingerprint blocks ordinary
  ordering with `PRIVACY_KEY_MIGRATION_REQUIRED`; never rotate around that guard.
- Keep production start command `npm run start`. Do not introduce any
  `PRIVACY_ISOLATED_*`, `PRIVACY_SYNTHETIC_DATABASE` or `PRIVACY_EXPECTED_DATABASE_*`
  settings, synthetic IDs, test JWTs, or `tests/*` startup/reset commands.

### Approved values to stage now; only used by later privacy operation

```dotenv
PRIVACY_ADMIN_USER_IDS=afca21ae-4c43-4c14-a2a7-f3ad790b12dc
PRIVACY_APPROVED_RETENTION_POLICY=SS-RETENTION-2026-10-23
PRIVACY_COMPLETION_TIMEFRAME=Normally within 30 calendar days after verification; an ownership conflict or legal hold may require longer.
PRIVACY_FISCAL_YEAR_END_MM_DD=12-31
```

Enter the text after `=` as the Dashboard value, without shell quotes. The ADMIN
allowlist is comma-separated with no added spaces; the ID must remain an active
ADMIN. The privacy service is constructed lazily after the deletion gate opens:
its key must be at least 16 characters and its timeframe must exactly match the
approved text. Policy reference and fiscal year-end are exact fulfillment checks.
There are no new environment variables for the owner-approved 24-month review dates;
they are code constants anchored to closure and `databaseErasedAt`.

### Later activation only

- Phone requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and
  `TWILIO_VERIFY_SERVICE_SID`. The adapter uses Account SID + **Auth Token** in HTTP
  Basic authentication, not an API key. Preserve privately saved values if present;
  this review does not attest to their current production presence or validity.
  They are unused with phone/deletion disabled. Enable no channel in this deployment.
- Email requires the existing `RESEND_API_KEY` plus a verified, approved
  `PRIVACY_VERIFICATION_FROM`. Do not overwrite a Resend key used by operational
  email or guess a sender. Email stays disabled pending that separate review.
- Channel selection prefers eligible email before phone; with email disabled an
  email-eligible customer does not automatically fall back to SMS. The successful
  isolated phone-only fixture does not prove this broader in-app path. Evaluate the
  existing selection behavior before customer initiation; no architecture change is
  made here.
- Initiation needs the approved live policy/deletion pages and a separately approved
  working channel. Fulfillment additionally requires the exact approved values,
  reviewed financial scope/holds, external-copy outcomes, and proven restore/privacy
  reconciliation. All four gates remain false in the present proposal.

## Mailbox and Apple dependency

Read-only searches for Apple case `103005572330`, including broader Apple/App Review
and Guideline 1.4.3 terms, found no response in the connected mailbox. The case stays
an external pending dependency; this is not evidence that Apple has not responded
through another account or portal.

## PR 93 rollout boundary (approved procedure; execution recorded above)

- Historical integration preparation: the previous `main`
  (`7bcaaf7cfff6f8e45ab0b912f35d61ffd56c7e39`) was merged into the privacy review
  branch by integration commit `99bc51b907380c274af8f98fe0b0aabad0db4f62`,
  whose parents are privacy head `9c657dd3cb3c59d5b9f6649eebf0e48abfacb44e`
  and that main commit. The merge was clean and preserves both main's full-history
  dispatcher-help validation and PR 93's serial PostgreSQL privacy validation. It
  also preserves the dispatcher-help and isolated-test package scripts; the
  overlapping dependency refresh required no lockfile conflict resolution.
  Current deployed main is now `c5f249fc079f2faa5ff99c61b193a0626eccc3aa` from
  security PR 96. Those runtime/CI changes are now integrated into this review
  branch. Both jobs use the checked-in Node 24.22.1 pin; the package conflict was
  resolved by keeping all isolated-test commands and serial backend tests. The
  privacy dependency graphs/lockfiles, four migrations and test tooling are
  preserved. Require combined CI for this revision, not the older evidence below.
- Read-only production schema inspection found every migration through
  `20261022170000_bnd_waiting_history` completed and no privacy table, target privacy
  column or partially applied privacy migration. A historical rolled-back
  `20260805015000_add_monthly_loyalty_reset` entry is followed by a successful entry
  of the same migration and is unrelated to PR 93. This is the current baseline, not
  permission to migrate production.
- Apply the four additive migrations in this order before code reads their fields:
  `20261023030000_customer_privacy_requests`,
  `20261023150000_privacy_access_credentials`,
  `20261023190000_adopt_retention_policy`, and
  `20261023220000_approved_privacy_review_dates`.
- The migrations are additive to existing customer/order responses, so the released
  Android client needs no new request field. However, PR 93 adds an anti-reactivation
  lookup to ordinary order create/update even while the four public privacy gates are
  false. The first migration must therefore succeed before the new process starts;
  deploying code against the current unmigrated schema would break those writes.
  Initially the marker table is empty, so existing Android ordering behavior remains
  unchanged; after a verified deletion, blocking recreation from an old client is
  intentional.
- Production Auto-Deploy is now Off following the authorized security rollout;
  keep it Off. Its observed lifecycle is build command
  `npm ci --include=dev && node ./node_modules/prisma/build/index.js generate && npm run build`,
  then pre-deploy command `npx prisma migrate deploy`, then start command
  `npm run start`. Render runs the pre-deploy command before starting the new
  application, enforcing migration-before-start ordering. Before any future merge,
  confirm auto-deploy remains off and record the last healthy deploy/commit so a
  merge cannot apply migrations implicitly. Then read back all four gates as false:
  `PRIVACY_DELETION_ENABLED=false`, `PRIVACY_FULFILLMENT_ENABLED=false`,
  `PRIVACY_VERIFICATION_EMAIL_ENABLED=false` and
  `PRIVACY_VERIFICATION_PHONE_ENABLED=false`.
- Configure, without displaying values, a stable dedicated `PRIVACY_DIGEST_KEY`, the
  current `PRIVACY_ADMIN_USER_IDS`, exact `PRIVACY_APPROVED_RETENTION_POLICY`, exact
  `PRIVACY_COMPLETION_TIMEFRAME`, and `PRIVACY_FISCAL_YEAR_END_MM_DD=12-31`. Retain
  Twilio/Resend credentials only for their separately gated channels; never copy the
  isolated control or synthetic JWT secrets into production.
- After Recovery/restore evidence, successful security-main combined CI
  and a current schema read-back are recorded, manually
  deploy only the reviewed combined commit. The pre-deploy hook must apply exactly the
  four migrations above. Stop on any drift or failed migration; do not resolve a
  failed migration as successful without establishing the actual schema state.
- With all gates still false, verify the expected commit through
  Render's live deploy record and separately require HTTP 200 from
  `/api/v1/health/ready` and `/api/v1/health/live` (these responses do not contain a
  commit SHA). Verify the four migration records, tables/columns and four protection
  triggers. Use only the read-only smoke checks below; ordinary ordering and loyalty
  mutation evidence comes from the passing isolated tests. Keep auto-deploy off.
- Publish and verify the final policy/deletion pages before enabling initiation. In a
  separate approved change, enable only one verified channel together with deletion
  initiation while fulfillment remains false, then run the documented production/iOS
  controlled flow. Enable fulfillment last and separately, only after external-copy,
  operator and restore procedures are recorded and Robert explicitly authorizes it.
- There are no down migrations. Code rollback may disable gates and redeploy the
  prior healthy application only after a read-only check establishes no real privacy
  challenge/request/access/audit/task/deleted-identity or erased-order state exists.
  Leave the additive schema and triggers in place; do not
  drop privacy objects or reverse migrations. Read back all four gates as false after
  rollback because platform rollback behavior must not be assumed to preserve the
  intended configuration.
- Once any real privacy state exists, do not roll back to pre-privacy `c5f249f` or
  older code, which cannot maintain status, revocation and anti-reactivation. Keep the
  privacy-capable code with gates off or deploy a reviewed forward fix. Preserve the
  digest key, revoked credentials, completed decisions, protection triggers and
  deleted-identity markers. A restore must reconcile post-snapshot requests/markers
  before traffic; never improvise destructive production rollback or recreate a
  deleted identity.

## Security-main combined integration verification

On 2026-10-26 (Toronto; CI timestamps 2026-10-27 UTC), the existing clean review
head `e07c3b9f4dd264414fbbcb915c00fc9b0c7a5473` and fetched security main
`c5f249fc079f2faa5ff99c61b193a0626eccc3aa` became the two parents of merge
`b597f5e8b6011e9cfc0fc778e87073143ecf7f9e`. No other main change was imported.
Production remains on security-only `c5f249f`; this review was not deployed.

- The only textual conflict was root `package.json`: retain the three isolated-test
  scripts and the security update's serial `npm test`. Both exact-version prebuild
  guards and both checked-in Node 24.22.1 pins are preserved.
- Both CI jobs select `.node-version` and run the runtime guard test first. That
  test now checks each job independently, full-history checkout, the help guard's
  Node setup ordering, serial timing-history commands and the serial privacy suite.
- Local serial structural checks passed: package/lock dependency graphs identical
  to the pre-merge privacy branch (only root engine metadata added), package/lock
  consistency, no privacy schema/migration/tooling changes, workflow assertion,
  JavaScript syntax, whitespace and dispatcher-help review against both parents.
  The Mac's Node 22 was used only for structural/help checks, not claimed as Node 24
  application validation. No install, simulator, local database or duplicate build.
- Both `validate` and `privacy-database` passed at the merge above in
  [PR CI 40438313429](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40438313429)
  and [push CI 40438309354](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40438309354).
  Logs from both jobs report Node **v24.22.1** and three passing runtime/guard checks.
- `validate`: Prisma format/validation/generation and backend build passed; **454
  backend tests passed**, four database-only tests skipped in the general suite and
  exercised separately. PostgreSQL 18 timing-history checks both passed. Dispatcher
  lint, **69 tests** and Linux production build passed. Both runtime-only dependency
  audits found zero vulnerabilities; the existing two dispatcher development-only
  findings remain documented in the security runbook, not hidden or fixed here.
- `privacy-database`: pinned complete baseline plus all four ordered migrations
  succeeded; **22 tests passed, zero skipped**. Coverage includes source-order
  binding, real mocked-delivery routes, due date/status/cancellation, disabled
  fulfillment, transaction rollback, financial evidence/receipt protection, access
  revocation, unaffected-customer behavior and fail-closed anti-reactivation/key
  rotation. General tests also cover approved fiscal/review dates, gates off,
  ordinary ordering and existing mobile contracts. All mutations use synthetic
  loopback PostgreSQL or mocks; no live provider call or production record is used.

Subsequent evidence edits are documentation only. Final pushed-head CI links belong
in PR 93's review description; the links above identify the exact tested code merge.
The protected restore exercise was subsequently approved and executed with the
qualified result above: record readability is verified and exact-copy deletion is
independently confirmed. The deleted clone's exact enum mismatch remains unknown;
the separate fresh-production assessment finds no ordering dependency or gates-off
deployment blocker. Do not request the same recovery approval again.
Recovery's three-day PITR and at-least-seven-day
export retention remain established owner observations, not unknown settings.

## Earlier main integration verification (preserved evidence)

The integrated review source was checked locally in serial on 2026-10-26. Backend
focused suites passed 90/90 tests with one worker, covering ordinary/manual/mobile
order creation, released-client contracts, privacy route and gate behavior,
financial-record evidence, protection rules and anti-reactivation. Dispatcher suites
passed 69/69 tests with one worker; backend and dispatcher production builds passed,
as did Prisma format/validation and `npm run check:dispatcher-help -- origin/main`.
The dispatcher build retained its existing unset local Maps-key placeholder and
large-chunk warnings; neither was a build failure. Reviewed application revision
`4aa373e7a50c1f79c047a7fa7e9260be9a3c431f` passed both `validate` and
`privacy-database` in [PR CI 40406476683](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40406476683)
and [push CI 40406469607](https://github.com/speedysweeties-ca/speedy-sweeties-backend/actions/runs/40406469607).
Those results were rechecked on 2026-10-26 before the earlier documentation update.
They do not substitute for the later security-main combined verification above.

## Smoke checks for the proposed gates-off deployment

Perform these only after a separate deployment approval. No real order, dispatch,
notification, verification or completion message is part of this smoke procedure.

1. Read Render's deployed SHA, verify it is the approved merge of the reviewed
   source, and read only sanitized startup/error outcomes. Require HTTP 200 from
   `GET /api/v1/health/live` and `GET /api/v1/health/ready`; readiness must report
   `checks.database=ok`. Do not infer schema readiness from `SELECT 1`.
2. In a read-only database transaction confirm the four named migration entries
   completed in order, no unresolved failed migration, expected privacy tables/columns,
   and enabled `privacy_retained_order_guard`, `privacy_receipt_guard`,
   `privacy_item_guard`, `privacy_help_guard`. The pre-deploy hook enforces migration
   ordering; `npm run start` alone does not run migrations. Stop on any discrepancy.
3. Read back only configuration presence/boolean equality, without secret values.
   Require all four gates false. An unauthenticated
   `GET /api/v1/privacy/deletion/admin/requests` must return HTTP 503 and
   `PRIVACY_SERVICE_UNAVAILABLE`, with `Cache-Control: no-store`. The gate precedes
   authentication, service construction and database/provider calls, so this probe
   cannot create a challenge or send anything. A 401/403/200 instead is a stop signal.
4. Through a currently valid staff session, `GET /api/v1/auth/me` and
   `GET /api/v1/orders?status=DELIVERED&page=1` exercise staff validation and dispatcher
   read serialization. Keep returned records private; retain status/schema assertions
   only. If no valid session is available, leave this check pending. Do not log in,
   reset passwords, change driver presence, open mutation controls or run AI help.
   Authentication failures can write session audit events; stop rather than retrying.
5. `GET /api/v1/orders/track/00000000-0000-4000-8000-000000000000` must return the
   normal 404 without creating any record. This checks route/database availability,
   not successful live tracking. Reuse isolated passing Android/iOS contract tests
   for successful tracking and ordering; do not create a production test order.
6. Do not use the loyalty GET as a no-write smoke check: its implementation can
   reset the customer's monthly loyalty state. Do not POST/PATCH orders, request
   codes, submit/cancel/fulfill requests, send receipts, invoke push, or alter dispatch.
   Production's existing operational jobs are outside the smoke calls; no test may
   create work for them. Observe sanitized errors and leave all four gates false.

## Owner-approved operational review periods

- Request/audit evidence: first review 24 calendar months after actual closure.
  Purpose: preserve minimized proof of verification, scope, decisions, external
  outcomes and completion long enough for operational follow-up or a complaint.
  Extend only for an active complaint, dispute, applicable hold or a documented
  need. An extension must record its reason and next review date. Review before
  removal; do not auto-delete or treat the review date as a minimum.
- Anti-reactivation marker: first review 24 calendar months after
  `databaseErasedAt`, when the marker is created.
  Purpose: stop restored data and old clients from recreating the deleted account.
  At review, retain it if any supported client, backup/restore path, unresolved case
  or incomplete HMAC-key migration can still reactivate the identity. The review date
  is not a promise of deletion, a minimum retention period or a legal requirement.
  Any extension requires a documented reason and next review date.

Robert approved both periods on 2026-10-23. This is owner approval, not Apple
approval. Backend review source now calculates the first dates from actual closure
and database erasure rather than asking the operator to choose them. Existing weekly
request and monthly retention reminders remain unchanged; no duplicate reminder or
automatic expiry worker was created.
