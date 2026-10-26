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
- The live API is still `main` commit `12b78cc4780c96efa286c167c63ac1676dfc5dbb`.
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
  The isolated adapter authenticated and received HTTP 201/pending for the final
  Verification, but its SMS delivery became `undelivered`, numeric error `30007`,
  on Canada/Telus. On 2026-10-26, Twilio support reported that its carrier partner
  identified a false positive, remediated it and requested another test. This is a
  provider-reported correction, not delivery evidence. Provider acceptance,
  Caller-ID verification and Geo Permission do not establish delivery. Keep
  production phone verification disabled; only the separately authorized isolated
  retest may proceed through the guarded one-message prompt.
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

- Draft PR 93 was rechecked at
  `5a198ee54de27838c3a49fc6aa8607e1c1b866af`, 22 commits ahead of production
  `12b78cc4780c96efa286c167c63ac1676dfc5dbb`. It remains draft and unmerged;
  Backend CI run 578 passed at that head.
- Apply the four additive migrations in this order before code reads their fields:
  `20261023030000_customer_privacy_requests`,
  `20261023150000_privacy_access_credentials`,
  `20261023190000_adopt_retention_policy`, and
  `20261023220000_approved_privacy_review_dates`.
- First deploy reviewed code with deletion, fulfillment, email and phone gates all
  false. Read back policy/timeframe/`12-31`, the current admin allowlist, separate
  digest secret, provider secret presence and health. Enable initiation only after
  the public policy/deletion pages and a controlled source-bound flow are verified.
  Enable each delivery channel separately; Twilio phone remains blocked by support.
  Enable fulfillment last, only after external-copy and restore procedures are
  recorded and Robert explicitly authorizes it.
- There are no down migrations. Code rollback may disable gates and redeploy the
  prior healthy application, but must preserve the additive schema, revoked
  credentials, completed decisions, protection triggers and anti-reactivation
  markers. A restore must reconcile post-snapshot requests/markers before traffic;
  never improvise destructive production rollback or recreate deleted identities.

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
