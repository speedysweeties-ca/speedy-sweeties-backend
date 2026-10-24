# Isolated Twilio privacy verification

This runbook is for one synthetic, phone-only verification against draft PR 93.
It does not authorize production deployment, customer messaging, fulfillment or
record deletion. The production `speedy-api` and `speedy-ordering-staging` services
are not test targets.

## Why Render is the prepared target

The preparation Mac has no PostgreSQL runtime, Docker or Podman, and only about
3.8 GiB free. Installing another database stack is not justified for this test.
The Render workspace already has its one allowed Free Postgres database assigned
to `speedy-ordering-staging-db`; that database and service must not be repurposed.

Use a new Ohio database and web service in the existing Speedy's workspace:

- Postgres name: `speedy-privacy-synthetic`
- Database name: exactly `speedy_privacy_synthetic`
- Postgres plan: `0.1c-256mb` (`basic-256mb`), 1 GB, PostgreSQL 18
- Web service: `speedy-privacy-isolated`, Free, Ohio, one instance
- Repository/branch: `speedysweeties-ca/speedy-sweeties-backend`,
  `review/customer-account-deletion`
- Auto-deploy: Off
- Build command: `npm ci --include=dev && npx prisma generate && npm run build && npm run privacy:isolated:prepare-render`
- Start command: `npm run privacy:isolated:server`
- Health check: `/health`

The database plan is currently listed at US$6/month for compute, with 1 GB storage
included; Render prorates paid compute and storage by the second. The Free web
service is $0 but shares the workspace's 750 monthly Free-instance hours and can
sleep after 15 idle minutes. Check the creation-page estimate before approving.
Delete both resources immediately after retaining sanitized test evidence. No paid
resource may be created without Robert's approval.

## Safeguards built into the branch

`preparePrivacyRenderDatabase.cjs` refuses to migrate unless `NODE_ENV=test`, both
synthetic/isolated assertions are exact, the URL database name is exactly
`speedy_privacy_synthetic`, its user is exactly `speedy_privacy_synthetic_user`,
and its hostname both equals the separately entered expected host and identifies
database resource `dpg-dbe37v59fdbs73961o3g-a`. Render's injected service ID/name
must identify `srv-dbe3861srm7s73dgfe50` / `speedy-privacy-isolated`. It reads the
committed pre-privacy schema fixture pinned from production
commit `12b78cc`, verifies that schema includes `DigitalReceipt` and excludes the
privacy models, and then applies only the four reviewed privacy migrations in order.
The committed fixture avoids depending on older Git objects being available in a
Render build checkout.

Preparation is repeat-safe. A database whose required privacy tables, columns and
write-protection triggers are complete is verified without modification. If setup
is incomplete, the preparer counts every present customer-bearing table and refuses
recovery if any contains a row. Only after confirming the exact synthetic database
identity and zero customer data does it drop and recreate that disposable database's
`public` schema, removing any failed Prisma migration record rather than falsely
marking it successful. It then rebuilds and re-verifies the complete baseline. These
recovery permissions do not apply to any production or shared staging database.

The preparer also has a separately gated, non-HTTP reset mode for this exact
disposable resource. `PRIVACY_ISOLATED_RESET=execute-once` is accepted only after
all target checks above pass. Before dropping the schema, it requires exactly one
fixture Customer, Order, User and failed-delivery PrivacyChallenge with the fixed
synthetic markers created by this runbook, and zero rows in every other application
table. Values used to prove the markers are never logged. Any unknown row, changed
marker, completed challenge, provider reference, privacy request, receipt or other
dependent record refuses the reset. A passing audit drops only that database's
`public` schema, rebuilds the pinned baseline and privacy migrations, then verifies
all required tables, columns and protection triggers and that every application
table is empty. Remove the one-shot value immediately after the reset deploy; the
server permits it only while diagnostics-only mode keeps messaging routes absent.

`privacyIsolatedServer.cjs` imports neither the normal app nor `server.ts`, so it
does not start session writers, undispatched-order alerts, pickup repair/monitoring,
B&D monitoring, geocoding, auto-dispatch or push handling. It additionally refuses
startup unless:

- all four privacy gates match the controlled-test values;
- JWT, digest and control secrets are present, sufficiently long and mutually
  distinct;
- the adopted policy, 30-calendar-day wording and `12-31` fiscal year end match;
- email, fulfillment, dispatch, B&D, AI/product lookup and unrelated provider keys
  are off or absent;
- the database has zero Customer, Order and User rows.

The authenticated fixture endpoint accepts one Canadian `+1` phone in request body,
creates one phone-only synthetic customer, one delivered iOS source order and one
non-login synthetic ADMIN record, then becomes single-use. It never logs the phone,
tokens or request body. The normal privacy router performs the actual
challenge/check/request/status/cancel work. A fulfillment attempt must return
`FULFILLMENT_DISABLED`, and a separate assertion confirms that the customer remains
and the order was not erased.

## Environment configuration

Set only the following variables on the isolated web service. Do not link a
production environment group or copy the production environment wholesale.

Non-secret values:

```text
NODE_ENV=test
PRIVACY_SYNTHETIC_DATABASE=yes
PRIVACY_ISOLATED_RENDER=yes
PRIVACY_DELETION_ENABLED=true
PRIVACY_VERIFICATION_PHONE_ENABLED=true
PRIVACY_VERIFICATION_EMAIL_ENABLED=false
PRIVACY_FULFILLMENT_ENABLED=false
PRIVACY_APPROVED_RETENTION_POLICY=SS-RETENTION-2026-10-23
PRIVACY_COMPLETION_TIMEFRAME=Normally within 30 calendar days after verification; an ownership conflict or legal hold may require longer.
PRIVACY_FISCAL_YEAR_END_MM_DD=12-31
PRIVACY_ADMIN_USER_IDS=synthetic-isolated-admin
AUTO_DISPATCH_ENABLED=false
BND_MONITOR_ENABLED=false
AI_PRODUCT_WEB_LOOKUP_ENABLED=false
FIREBASE_SERVICE_ACCOUNT_JSON={}
```

Connection values:

- `DATABASE_URL`: the new database's **internal** URL, added from the isolated
  database connection control; never the production or ordering-staging URL.
- `PRIVACY_EXPECTED_DATABASE_HOST`: hostname parsed from that same internal URL.
- `PRIVACY_EXPECTED_DATABASE_RESOURCE_ID`: exactly
  `dpg-dbe37v59fdbs73961o3g-a`; this is non-secret and is checked against the
  connection hostname. Render's documented `RENDER_SERVICE_ID` and
  `RENDER_SERVICE_NAME` variables provide the independent service identity check.

Reset control:

- Normally set `PRIVACY_ISOLATED_RESET=disabled`.
- Only an explicitly authorized reset deploy may temporarily use
  `PRIVACY_ISOLATED_RESET=execute-once`, and only with
  `PRIVACY_ISOLATED_DIAGNOSTICS_ONLY=true`, deletion/phone gates false, email and
  fulfillment false. Restore `disabled` before the retry deploy.

Generate three separate random values of at least 32 characters in Render's secret
entry UI; never reuse or reveal them:

- `JWT_SECRET`
- `PRIVACY_DIGEST_KEY`
- `PRIVACY_ISOLATED_CONTROL_SECRET`

Paste the existing Twilio values directly from Twilio to this isolated service:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN` — the implementation uses the account Auth Token, not an API key
- `TWILIO_VERIFY_SERVICE_SID`

Do not add `RESEND_API_KEY`, `PRIVACY_VERIFICATION_FROM`, B&D credentials, OpenAI
keys, Google keys, Firebase credentials, alert destinations or any production-only
setting. The isolated server rejects those values.

## Secure dashboard entry

1. After Robert approves the paid database, open Render Dashboard in Speedy's
   workspace and create **New > Postgres** with the exact database settings above.
   Leave external access disabled/empty. Copy its internal connection control only
   through Render's environment-variable link/paste flow; do not paste it into chat.
2. Create **New > Web Service**, select the existing backend repository, choose the
   review branch, Ohio and Free. Set Auto-Deploy to Off, then enter the exact build,
   start and health-check values above.
3. In the new service's **Environment** page, use **Add Environment Variable** for
   the non-secret settings. Use the masked secret-value controls for database/Twilio
   credentials and the three newly generated secrets. Do not use an environment
   group. Review names before saving; secret values must remain hidden.
4. Save only on this isolated service. A deliberate first deploy is expected when
   creating it; no production service is selected or changed. Verify `/health`
   returns the isolated scope and inspect logs only for the sanitized readiness line.
   Do not run the client if startup refuses a safeguard.

## One-message procedure (not yet authorized)

From the repository in an interactive terminal, run:

```text
npm run privacy:isolated:client
```

The client accepts no phone, control secret or OTP command-line arguments. It uses
raw terminal input for those values, including pasted text, without echo. Phone input
accepts ten Canadian digits (or the same digits prefixed by `+1`), normalizes them to
`+1` format, and retries with a generic message that never repeats rejected input.
Before asking for a phone, it calls an authenticated, side-effect-free preflight that
confirms the current control secret, unused fixture state, enabled phone verification
and disabled email/fulfillment gates. Invalid authentication deliberately returns a
generic 404 and cannot create a fixture. It then prepares the synthetic fixture
without messaging, shows only the destination's
last four digits, and stops unless Robert types the exact one-message authorization.
It performs one Verify start and one Verify check; there is no resend or OTP retry
loop. Output is limited to a sanitized result:
SMS-attempt count, approved check, source binding, recorded due date, disabled
fulfillment, unchanged data and cancellation status.

Before running it, Robert must privately enter a mobile number he controls and then
explicitly authorize one verification SMS to the displayed masked destination. Do
not assume the published business number can receive it.

## Evidence and cleanup

Closeout evidence, 2026-10-24: the final authorized Verify start returned provider
HTTP 201 with status `pending`; Twilio later recorded the SMS delivery attempt as
`undelivered`, numeric error `30007`, on Canada/Telus. No OTP/check/completion or
fulfillment occurred. Robert submitted a Twilio support ticket. Preserve this
sanitized outcome and the earlier HTTP 403/code 21608 rejection. Do not send again
or alter the verification architecture while support investigates.

If a live Verify start returns the generic delivery-unavailable response, do not
retry it. Temporarily set `PRIVACY_ISOLATED_DIAGNOSTICS_ONLY=true`, both deletion
and phone-verification gates to `false`, and provide a UTC diagnostic interval of
no more than 15 minutes in `PRIVACY_ISOLATED_DIAGNOSTIC_AFTER` and
`PRIVACY_ISOLATED_DIAGNOSTIC_BEFORE`. In this mode the server does not mount the
fixture or privacy messaging routes. It makes only authenticated GET requests for
the Twilio Account, Verify Service, Verification Attempts and Monitor Alerts, and
logs a sanitized result containing status/error numbers, account state, ownership
matches and delivery state. It never logs destinations, SIDs, credentials, OTPs or
raw provider bodies. Restore the controlled-test gates only after reviewing the
diagnosis and before any separately authorized retry.

Record only commit SHA, isolated service/database IDs, UTC start/end, masked last
four digits, HTTP/result states and sanitized Render/Twilio status. Do not preserve
the phone, OTP, tokens, provider credentials, connection URL or request bodies.

After the test:

1. confirm the request ended `CANCELLED`, fulfillment was rejected and records were
   unchanged;
2. delete exact service `srv-dbe3861srm7s73dgfe50` / `speedy-privacy-isolated`
   in its Settings danger area;
3. delete exact database `dpg-dbe37v59fdbs73961o3g-a` /
   `speedy-privacy-synthetic` in its Settings danger area;
4. confirm both isolated resources are absent and production/staging deploys and
   database IDs are unchanged;
5. check Render Billing for the final prorated amount and preserve only that amount.

Deleting the disposable database removes only synthetic records and is expected to
be irreversible. Resolve both exact resource IDs before deletion; never select
`speedy-api`, `speedy-sweeties-db`, `speedy-ordering-staging`, or its database.
