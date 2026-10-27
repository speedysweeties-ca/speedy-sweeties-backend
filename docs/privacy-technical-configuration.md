# Privacy deletion technical configuration and isolated evidence

Updated 2026-10-27. The production findings came from repository inspection plus
read-only Render/PostgreSQL and mailbox access. The isolated-test update separately
used the authorized disposable service/database reset and deploy sequence; no secret
value was requested or displayed and no message was sent. Ordering staging, backups
and customer records were not changed. The later, separately authorized PR 96
security rollout is recorded below; this evidence update itself is documentation-
only and does not activate privacy behavior.

## Confirmed configuration facts

- Approved fiscal year-end: December 31. The review branch records
  `PRIVACY_FISCAL_YEAR_END_MM_DD=12-31`; fulfillment rejects another value.
- Production has one active `ADMIN` row. Its allowlist value is
  `afca21ae-4c43-4c14-a2a7-f3ad790b12dc` (`admin@speedysweeties.ca`). Read it back
  immediately before rollout in case staff records change.
- Confirmed privacy contact: Robert Stubbings, `speedysweeties@hotmail.com`,
  `519-826-8097`.
- The live API and dispatcher now use security PR 96's `main` merge
  `c5f249fc079f2faa5ff99c61b193a0626eccc3aa`. Runtime/certificate items are closed
  on Robert's owner-provided Shell evidence in `docs/production-security-maintenance.md`;
  cron evidence remains build-only. Auto-Deploy is Off for all three. The
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
  passed. A narrow catalog comparison remains needed to close this qualification;
  no repair, migration, extra clone or automatic rerun was performed.

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
sanitized evidence above. The enum discrepancy still needs a narrow source/catalog
investigation; deleting the copy neither resolves it nor proves data loss. The
deleted clone cannot be queried again. Do not recreate it or treat this closeout as
approval for another paid resource, a production migration or deployment.

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

Target only `speedy-api` (`srv-d7ntlnpkh4rs73bev9q0`). This is a proposed change
sheet; no production environment values were read or changed in this review.

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

## PR 93 rollout boundary

- Draft PR 93 remains unmerged. The previous `main`
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
qualified result above: record readability is verified, one enum comparison remains
unresolved, and exact-copy deletion is independently confirmed. Do not
request the same approval again. Recovery's three-day PITR and at-least-seven-day
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
