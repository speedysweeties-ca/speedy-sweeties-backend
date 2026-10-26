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
  The privacy routes/migrations in draft PR 93 are not deployed, so no live
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
- Render documents continual point-in-time backup for paid PostgreSQL. The recovery
  window depends on workspace plan, which the connector does not reveal. The MCP
  also cannot list recovery points or logical exports.
- No backup cron/service, `pg_dump`, S3 backup workflow or other independent backup
  automation is present in the connected Render resources or repository. This does
  not prove that a manually created export or external process does not exist.
- Before activation, Robert or the Render workspace owner must inspect the production
  database Recovery page and record: workspace plan, available PITR window, any
  logical exports and their dates, any external copies/operators, and the tested
  non-production restore procedure. A restore must reconcile privacy requests newer
  than the snapshot and reapply deleted-identity markers, revocations, erased-order
  guards and completed decisions before traffic resumes.

## Mailbox and Apple dependency

Read-only searches for Apple case `103005572330`, including broader Apple/App Review
and Guideline 1.4.3 terms, found no response in the connected mailbox. The case stays
an external pending dependency; this is not evidence that Apple has not responded
through another account or portal.

## PR 93 rollout boundary

- Draft PR 93 was rechecked before this evidence-only update at
  `686a2d9f96d7b81530b5a1b17f0429a215b4a8c0`. It remains draft and unmerged. Its
  merge base with current `main` is `12b78cc4780c96efa286c167c63ac1676dfc5dbb`;
  production is now `7bcaaf7cfff6f8e45ab0b912f35d61ffd56c7e39` after the dispatcher-help release.
- A dry merge-tree found no textual conflict markers. Both branches change
  `.github/workflows/backend-ci.yml`, `docs/release-checklist.md` and `package.json`.
  Before deployment, integrate current `main` into the review branch and preserve
  both sets: main's dispatcher-help fetch/check and package script, plus PR 93's
  serial PostgreSQL privacy job and three isolated-test scripts. The lockfile's
  overlapping dependency refresh is presently identical. Re-run current combined CI
  after that integration; the prior passing PR run does not validate the combined
  head.
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
- Production currently auto-deploys `main`, and its pre-deploy command runs
  `npx prisma migrate deploy`. Before any future merge, turn auto-deploy off and record
  the last healthy deploy/commit so merge cannot apply migrations implicitly. Then
  set and read back all four gates as false: `PRIVACY_DELETION_ENABLED`,
  `PRIVACY_FULFILLMENT_ENABLED`, `PRIVACY_VERIFICATION_EMAIL_ENABLED` and
  `PRIVACY_VERIFICATION_PHONE_ENABLED`.
- Configure, without displaying values, a stable dedicated `PRIVACY_DIGEST_KEY`, the
  current `PRIVACY_ADMIN_USER_IDS`, exact `PRIVACY_APPROVED_RETENTION_POLICY`, exact
  `PRIVACY_COMPLETION_TIMEFRAME`, and `PRIVACY_FISCAL_YEAR_END_MM_DD=12-31`. Retain
  Twilio/Resend credentials only for their separately gated channels; never copy the
  isolated control or synthetic JWT secrets into production.
- After Recovery/restore facts and a current schema read-back are recorded, manually
  deploy only the reviewed combined commit. The pre-deploy hook must apply exactly the
  four migrations above. Stop on any drift or failed migration; do not resolve a
  failed migration as successful without establishing the actual schema state.
- With all gates still false, verify the expected commit, health/readiness, four
  migration records, tables/columns and four protection triggers. Smoke-test ordinary
  ordering, tracking, loyalty, staff authentication and the released Android API;
  confirm privacy initiation fails closed while disabled. Keep auto-deploy off through
  this validation.
- Publish and verify the final policy/deletion pages before enabling initiation. In a
  separate approved change, enable only one verified channel together with deletion
  initiation while fulfillment remains false, then run the documented production/iOS
  controlled flow. Enable fulfillment last and separately, only after external-copy,
  operator and restore procedures are recorded and Robert explicitly authorizes it.
- There are no down migrations. Code rollback may disable gates and redeploy the
  prior healthy application only if no privacy request/access/deleted-identity or
  erased-order state exists. Leave the additive schema and triggers in place; do not
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
