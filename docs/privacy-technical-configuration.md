# Privacy deletion technical configuration and isolated evidence

Updated 2026-10-26. The production findings came from repository inspection plus
read-only Render/PostgreSQL and mailbox access. The isolated-test update separately
used the authorized disposable service/database reset and deploy sequence; no secret
value was requested or displayed and no message was sent. Production, ordering
staging, backups and customer records were not changed.

## Confirmed configuration facts

- Approved fiscal year-end: December 31. The review branch records
  `PRIVACY_FISCAL_YEAR_END_MM_DD=12-31`; fulfillment rejects another value.
- Production has one active `ADMIN` row. Its allowlist value is
  `afca21ae-4c43-4c14-a2a7-f3ad790b12dc` (`admin@speedysweeties.ca`). Read it back
  immediately before rollout in case staff records change.
- Confirmed privacy contact: Robert Stubbings, `speedysweeties@hotmail.com`,
  `519-826-8097`.
- The live API is `main` commit `7bcaaf7cfff6f8e45ab0b912f35d61ffd56c7e39`.
  Render reported live deploy `dep-dbej0hks728c73clt3gg` at that revision. The
  privacy routes/migrations in draft PR 93 are not deployed, so no live
  `PRIVACY_*` setting or request behavior is claimed.
- The production 90-day retention cron remains a marketing `DRY_RUN`. Read-only
  logs on 2026-10-23 reported `SMS messages sent: 0`; it is not an inactive-profile
  deletion or privacy-expiry worker.

## Providers and logs

- Resend is demonstrably configured for the existing B&D operational-email feature:
  its database toggle is enabled and 60 provider-accepted receipts existed, most
  recently 2026-10-23. This establishes neither a privacy-verification sender/domain
  nor Resend deletion, retention, location or inbox-delivery outcomes. Those remain
  separate account/dashboard checks before enabling privacy email.
- No Twilio integration exists on live `main`; production privacy flags remain
  disabled. Robert confirmed the Speedy Sweeties Verify service, SMS enabled with
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
- Actual PITR availability, earliest/latest selectable recovery timestamps,
  workspace recovery window, and available logical exports remain **unverified**.
  The Render connector exposes no recovery/export read operation. No Render CLI or
  `RENDER_API_KEY` was available; read-only Safari access timed out and Chrome was
  not running. No account secret was sought or displayed. Neither an empty backup
  inventory nor a particular retention period can be inferred from this access gap.
- The documented read-only REST operations are
  `GET /v1/postgres/dpg-d7m33g2qqhas73f58hrg-a/recovery` (`recoveryStatus`, `startsAt`)
  and `GET /v1/postgres/dpg-d7m33g2qqhas73f58hrg-a/export` (export ID/date and a
  sensitive download URL). They require authenticated access not supplied by this
  connector. If used later, retain only status/timestamps/counts; suppress download
  URLs and credentials. No export creation or recovery was triggered.
- No backup cron/service, `pg_dump`, S3 backup workflow or other independent backup
  automation is present in the connected Render resources or repository. This does
  not prove that a manually created export or external process does not exist.
- Before deployment approval, inspect [production database → Recovery](https://dashboard.render.com/d/dpg-d7m33g2qqhas73f58hrg-a):
  record the observation time/timezone, displayed recovery availability, earliest
  and latest selectable timestamps, workspace plan, and export count/dates/status.
  Inspect the date selector without clicking Start Recovery or Create export.
  Record external copies/operators separately; none are established by the connector.
- No completed non-production backup-restore evidence was found in repository docs,
  tests, history, iOS release handoffs or the targeted Render/recovery mailbox search.
  `privacyDeletion.database.test.js` tests transaction rollback and anti-reactivation;
  `preparePrivacyRenderDatabase.cjs` rebuilds a synthetic baseline. Neither proves
  recovery from a backup. The exercise below is prepared, **not executed**.

## Prepared recovery exercise (separate authorization required)

1. Capture the production Recovery evidence above and select a timestamp actually
   offered by Render. Record its UTC value and source resource ID. Current Render
   documentation describes PITR as creating a new instance and excludes the latest
   ten minutes; the observed selector remains authoritative for availability.
2. Request approval for **one new, temporary PITR database** in Ohio, proposed name
   `speedy-privacy-restore-rehearsal-20261026`, with no attached web service, worker,
   cron, environment group or production connection change. Approval must explicitly
   cover the protected production-data copy and the Dashboard's quoted compute plus
   storage price, prorated. No current quote is available, so no price is asserted.
   The old US$6/month approval was for the named SMS resources and does not authorize
   this resource. Select the smallest supported plan after seeing the quote; request
   a total ceiling and a cleanup deadline of at most 24 hours. Provision nothing
   until those terms are approved.
3. Independently verify the new resource ID, host, database, owner and region before
   any write. Never use production `dpg-d7m33g2qqhas73f58hrg-a`, ordering staging
   `dpg-davbqnhsrm7s73bd3uq0-a`, or SMS database `dpg-dbe37v59fdbs73961o3g-a`
   as the restore destination. The SMS service `srv-dbe3861srm7s73dgfe50` is also
   excluded. Render copies the source IP allowlist during PITR; production currently
   allows `0.0.0.0/0`, so restrict the **new clone only** to the authorized operator
   before inspecting it. Never start `src/server.ts` on the restored data: startup
   includes background monitors and repairs. Database tools alone are sufficient.
4. Wait for the new instance to be available. Through read-only SQL check migration
   history, schema, foreign keys, row-count consistency and aggregate receipt/item
   amounts. A moving production database is not a row-for-row reference for a past
   snapshot; verify against snapshot timing and document that limit. Do not export
   customer rows, receipt notes, phone numbers or credentials into evidence.
5. On that independently verified clone only, run the reviewed revision's
   `npx prisma migrate deploy` once, inspect the four completed migration records,
   and run it again to confirm nothing remains pending. Compare pre/post aggregate
   financial evidence and counts; verify all four protection triggers are enabled.
   Use privately supplied clone credentials; do not log a connection URL. Do not run
   the synthetic reset/preparer or app server against this production-data copy.
6. Separately rehearse the post-snapshot privacy reconciliation using **only synthetic
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
7. The durable source and operator procedure for post-snapshot privacy decisions
   still need to be established before fulfillment activation. Restoring an old
   snapshot alone cannot reconstruct later decisions; no automatic replay system
   is claimed. The synthetic exercise must prove the chosen reconciliation procedure
   before it is used on real requests. A new ephemeral runner run requires available
   included CI minutes or separate cost approval; it needs no paid web service.
8. Preserve only resource/revision IDs, recovery timestamp, elapsed time, migration
   results and aggregate/pass-fail evidence. Delete the new clone and ephemeral
   synthetic snapshots after validation, or immediately on an unresolved blocker,
   within the approved deadline. Confirm resource absence and stopped charges.
   Preserve the original production database, staging and SMS resources.

This exercise uses the current [Render recovery documentation](https://render.com/docs/postgresql-backups)
and [recovery-status API](https://api-docs.render.com/reference/retrieve-postgres-recovery-info),
read on 2026-10-26. Provider documentation is not evidence that this account has a
particular usable recovery point. No restore pass, backup window or price is claimed.

## Exact production configuration checklist

Target only `speedy-api` (`srv-d7ntlnpkh4rs73bev9q0`). This is a proposed change
sheet; no production environment values were read or changed in this review.

### Startup and ordinary ordering with privacy disabled

- Preserve existing `DATABASE_URL`, `JWT_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`,
  `NODE_ENV=production`, `CORS_ORIGIN` and Render's port. The first three are required
  by `src/config/env.ts`; production also requires CORS, and Firebase initialization
  parses/validates its service-account JSON. Do not rotate the existing JWT or copy
  synthetic secrets. Preserve all unrelated provider/dispatch/background-job settings.
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

## PR 93 rollout boundary

- Draft PR 93 remains unmerged. Current `main`
  (`7bcaaf7cfff6f8e45ab0b912f35d61ffd56c7e39`) was merged into the privacy review
  branch by integration commit `99bc51b907380c274af8f98fe0b0aabad0db4f62`,
  whose parents are privacy head `9c657dd3cb3c59d5b9f6649eebf0e48abfacb44e`
  and that main commit. The merge was clean and preserves both main's full-history
  dispatcher-help validation and PR 93's serial PostgreSQL privacy validation. It
  also preserves the dispatcher-help and isolated-test package scripts; the
  overlapping dependency refresh required no lockfile conflict resolution.
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
- Production currently auto-deploys `main`. Its observed lifecycle is build command
  `npm ci --include=dev && node ./node_modules/prisma/build/index.js generate && npm run build`,
  then pre-deploy command `npx prisma migrate deploy`, then start command
  `npm run start`. Render runs the pre-deploy command before starting the new
  application, enforcing migration-before-start ordering. Before any future merge,
  turn auto-deploy off and record the last healthy deploy/commit so merge cannot
  apply migrations implicitly. Then set and read back all four gates as false:
  `PRIVACY_DELETION_ENABLED=false`, `PRIVACY_FULFILLMENT_ENABLED=false`,
  `PRIVACY_VERIFICATION_EMAIL_ENABLED=false` and
  `PRIVACY_VERIFICATION_PHONE_ENABLED=false`.
- Configure, without displaying values, a stable dedicated `PRIVACY_DIGEST_KEY`, the
  current `PRIVACY_ADMIN_USER_IDS`, exact `PRIVACY_APPROVED_RETENTION_POLICY`, exact
  `PRIVACY_COMPLETION_TIMEFRAME`, and `PRIVACY_FISCAL_YEAR_END_MM_DD=12-31`. Retain
  Twilio/Resend credentials only for their separately gated channels; never copy the
  isolated control or synthetic JWT secrets into production.
- After Recovery/restore facts and a current schema read-back are recorded, manually
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
- Once any real privacy state exists, do not roll back to pre-privacy `7bcaaf7` code,
  which cannot maintain status, revocation and anti-reactivation behavior. Keep the
  privacy-capable code with gates off or deploy a reviewed forward fix. Preserve the
  digest key, revoked credentials, completed decisions, protection triggers and
  deleted-identity markers. A restore must reconcile post-snapshot requests/markers
  before traffic; never improvise destructive production rollback or recreate a
  deleted identity.

## Current-main integration verification

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
Those results, current main/PR head, production live deploy and health were rechecked
on 2026-10-26 before this documentation-only update. Application, schema, dependencies
and workflows are unchanged; no application tests were manually rerun. Subsequent
documentation commits must be identified separately from the tested source revision.

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
