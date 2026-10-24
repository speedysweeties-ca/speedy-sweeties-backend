# Customer account deletion — review implementation, not deployed

Updated 2026-10-23 on `review/customer-account-deletion` for draft PR 93. This
branch must not be merged into an automatically deploying branch until the owner
decisions, provider checks, isolated-database CI and rollout review below pass.
No production migration, message, customer record, provider setting or deployment
was used to implement or test this flow.

## Customer flow

1. In Account > Delete account, iOS uses exactly one credential already stored on
   that installation: an unexpired source-order tracking token, the existing signed
   customer loyalty token, or a durable privacy-access token. The customer does not
   type a phone number/email and is not asked to place a new order.
2. The server resolves one source Order and Customer from that credential. It sends
   a code only when the source-order contact still matches the Customer and that
   normalized contact appears on exactly one Customer profile. Email is preferred
   when eligible; phone-only customers use Twilio Verify SMS. The response shows
   only a masked destination after credential validation.
3. The first successful challenge creates a random, customer/source-order-bound
   privacy-access credential. Only its SHA-256 hash is stored server-side; the
   256-bit secret is stored in the app Keychain. It remains usable after the
   48-hour tracking token expires. Existing installations can enroll once using
   the 365-day loyalty credential plus the fresh contact code.
4. Privacy access is identification/possession evidence, not deletion authority.
   Every deletion or status-credential recovery requires a fresh purpose-bound
   contact challenge. Challenges expire after ten minutes, allow at most five
   attempts, have durable contact/requester rate limits and supersede earlier
   challenges for the same Customer. A contact/profile change invalidates proof.
5. Before submission, iOS stores a random request ID/status secret in a separate
   Keychain namespace. Submission is idempotent. Request received is not deletion
   completed; status and cancellation require that secret.
6. If an active request exists but its status secret was lost, privacy access plus
   a fresh code rotates the status secret, records an audit event and returns the
   existing request. A lost device plus no surviving privacy/loyalty credential or
   verified channel is Robert-only manual review; the customer need not order.
7. A verified request stores its own due date 30 calendar days after submission.
   The app displays the adopted timeframe at challenge and confirmation, and the
   exact due date at status. Completion and the retention explanation are confirmed
   through authenticated in-app status. No completion email/SMS is claimed or sent.
8. A customer who has uninstalled the app can initiate through the public website
   account-deletion page. That route reaches Robert for the same private recovery
   review; a typed contact or supplied order facts never becomes deletion authority.

## Scope and shared/reassigned-contact safeguards

Current control of a phone number/email proves only current channel control. It
does not establish ownership of every historical record containing that contact.
The source order and Customer are fixed by the pre-existing credential, never by a
typed contact. Duplicate Customer contacts fail closed before delivery.

Fulfillment compares every linked order's normalized name, phone and email with the
source order. Any different identity is listed as `conflictingLinkedOrderIds` and
causes `HISTORICAL_SCOPE_REVIEW_REQUIRED`. Detached phone-matching orders separately
cause `UNLINKED_RECORDS_REQUIRE_REVIEW`. Neither list is automatically relinked,
shown to the requester or deleted. An active delivery also causes a hold.

Robert alone handles exceptional recovery at launch. Staff must have a current
ADMIN session and their user ID must appear in `PRIVACY_ADMIN_USER_IDS`. Supporting
order facts (date, items, total, address, receipt/order number or caller name) can
help Robert search privately but never add up to authorization. Conflicting owners,
shared/reassigned channels, recent edits or inconsistent links override supporting
facts and remain on hold without disclosing another customer.

## Verification delivery

Email uses the existing Resend HTTPS pattern with a server-generated eight-digit
code, ten-minute expiry, request idempotency key and ten-second timeout. Production
requires an approved verified sender/domain and explicit email flag.

Phone uses Twilio Verify: the server starts a Verification for its selected E.164
Canadian number and later calls Verification Check for the submitted code. Twilio
manages the SMS code/lifecycle; the application still owns subject/source-order
binding, generic responses, local attempt/requester limits, supersession, audit and
historical scope. Credentials remain server-side and tests use injected fetch mocks.
No phone number, provider credential, code or provider error body is put in a URL,
public error or audit event.

Production activation is blocked until Robert confirms the actual Twilio account's
Canadian Verify eligibility, geographic permissions, price/taxes, spend controls,
privacy/DPA, retention/data-location and incident/support terms. The existing
Resend account needs equivalent sender/quota/privacy/retention confirmation. Do not
put secrets in Git, tickets, screenshots or this document.

## Fulfillment and retained records

The restricted dispatcher preview shows the verified source order, active orders,
detached candidates, identity-conflicting linked orders, exact financial fields,
external systems and removal description. Fulfillment requires the same preview
hash/version, a strict retention decision and the configured approved policy
reference. There are no UI retention defaults.

The inspected receipt is structured from the `DigitalReceipt` row plus `OrderItem`
names, quantities and prices. Removing item names would therefore destroy the only
stored item description. `DigitalReceipt.notes` is free text, but the dispatcher
also parses three receipt facts from it: extra-stop count, extra-stop charge and
distance surcharge. Fulfillment copies only those recognized facts into structured
`retainedChargeEvidence`, then removes the original free text. This preserves the
receipt/transaction evidence without retaining an arbitrary note such as an access
code. The dispatcher reads either the original recognized note fields or the
structured retained values, uses the receipt creation date after personal order
timestamps are removed, and renders the stored item, delivery/service, tax/fee and
grand-total amounts rather than hard-coded example components.

The transaction removes the Customer and eligible contact/address/geocode/order
instructions, help/check-in/dispatch/pickup/edit-pause data, push/tracking
credentials, receipt free text and item catalogue links from reviewed linked orders.
It preserves the strict financial/structural list in `retainedFinancialFields`:
record IDs, order/receipt numbers, timestamps, payment/order status, item
descriptions, quantities, prices, receipt totals/charges/tax and the recognized
receipt-charge evidence. It does not retain customer contact or delivery details
merely because financial evidence is retained. Retained erased orders, receipts and
items have database write/delete guards. Customer/order creation shares the privacy
advisory lock, and a keyed deleted-identity marker prevents old clients/restores
from recreating the profile. Unplanned key rotation fails closed.

After the database transaction, status is `FULFILLING`. Durable tasks cover phones/
synced contacts, messages/email, staff notes/exports, logs/providers and backups/
restore. Robert must record verified removal evidence or a justified retain-until
date for each. Only then can status become `COMPLETED`. These tasks are an audit
control, not provider deletion adapters.

Policy `SS-RETENTION-2026-10-23` sets the financial minimum to six years after the
end of the last tax year containing an affected order, subject to a longer applicable
hold. The backend validates both the configured fiscal year-end and the case's
calculated tax-year end before fulfillment. Robert confirmed a December 31 fiscal
year-end, recorded as `12-31`. For an affected order in tax year 2026, the ordinary
minimum is therefore the end of 2032; a later applicable hold can extend it. The
deletion-request date never starts or shortens this calculation.

The request/audit retain-until, suppression review date, justification and field set
remain required per case. The current engineering proposal—explicitly not yet owner-
approved—is a 24-month post-closure review date for minimized request/audit evidence
and a first review 24 months after `databaseErasedAt` for the keyed anti-reactivation
marker.
An active complaint, dispute or hold extends request evidence. The marker must not be
removed at review while any supported old client, recoverable backup or restoration
path can recreate the profile, or while its key migration is incomplete. These are
manual review dates, not automatic deletion dates or claimed legal requirements.
If approved, the runbook/code still needs to record the closure-based audit date for
cancelled or otherwise closed requests; the existing fulfillment decision can record
the database-erasure-based dates for fulfilled requests but must not guess them.
External retained copies require their own verified outcome or explicit expiry.
Robert's existing weekly request and monthly retention reviews are the launch process;
an automatic expiry worker is deferred. There is no automatic two-year inactive-
profile deletion.

## Configuration — all off by default

- `PRIVACY_DELETION_ENABLED=true`: expose request/admin routes after migration.
- `PRIVACY_DIGEST_KEY`: dedicated stable HMAC key. Generate/store through existing
  production secret management; never expose it to iOS. Preserve it for restores
  and planned rotation/migration.
- `PRIVACY_COMPLETION_TIMEFRAME`: must exactly equal `Normally within 30 calendar
  days after verification; an ownership conflict or legal hold may require longer.`
- `PRIVACY_ADMIN_USER_IDS`: comma-separated current Robert ADMIN user ID(s). The
  read-only production lookup confirmed `afca21ae-4c43-4c14-a2a7-f3ad790b12dc` is
  the single active ADMIN record; read it back again immediately before rollout.
- `PRIVACY_VERIFICATION_EMAIL_ENABLED=true`, `PRIVACY_VERIFICATION_FROM`, existing
  `RESEND_API_KEY`: only after sender/account review.
- `PRIVACY_VERIFICATION_PHONE_ENABLED=true`, `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`: only after Twilio review.
- `PRIVACY_APPROVED_RETENTION_POLICY`: must exactly equal
  `SS-RETENTION-2026-10-23`.
- `PRIVACY_FISCAL_YEAR_END_MM_DD=12-31`: Robert's confirmed December 31 corporate
  fiscal year-end. Fulfillment requires this exact adopted value.
- `PRIVACY_FULFILLMENT_ENABLED=true`: final irreversible fulfillment gate; keep
  false until all retention/external/operator checks are ready.

The service refuses to initialize without a non-empty completion timeframe. Phone
or email delivery refuses to operate unless its explicit channel flag and required
configuration are present. Production fulfillment additionally requires the
dedicated digest key, exact adopted policy/timeframe, configured fiscal year-end
and fulfillment flag.

Read-only production findings and the remaining dashboard checks are recorded in
`docs/privacy-technical-configuration.md`. The frozen Android integration contract
is recorded in `docs/android-account-deletion-handoff.md`; no Android merge or release
is part of the current iOS/backend scope.

## Staged rollout plan (requires a later explicit deployment approval)

1. Freeze and record exact iOS/backend commits, CI results and schema drift review.
   Confirm PR 93 still targets a non-auto-deploy review branch.
2. Robert completes the retention worksheet/runbook and provider/account checks.
   Record only non-secret configuration names/status in the release evidence.
3. Back up/verify recovery procedures. Apply the additive privacy migrations before
   starting code that reads the new tables. Do not rewrite historical migrations.
4. Deploy backend code with every privacy feature/channel/fulfillment flag false.
   Verify ordinary ordering, tracking, loyalty and staff authentication first.
5. Configure the stable digest key, timeframe, Robert allowlist, provider settings
   and approved policy reference through secret/config management. Read back only
   presence/flags, never secret values.
6. Enable the needed verified channels and request route while fulfillment remains
   false. Perform an explicitly authorized controlled non-production/synthetic
   verification; do not use an unrelated customer's contact.
7. After request/status/cancel/admin preview evidence and external-system operator
   readiness are reviewed, separately approve `PRIVACY_FULFILLMENT_ENABLED=true`.
8. Monitor provider errors/rate limits, privacy audit events, open-case age and all
   retention/external review dates. Publication/App Review must use the same final
   timeframe/policy and a functioning backend.

## Rollback and incident plan

- Stop new initiation/delivery by setting `PRIVACY_DELETION_ENABLED=false` and both
  verification channel flags false. Set `PRIVACY_FULFILLMENT_ENABLED=false` first
  for any identity, retention or deletion concern.
- Keep the additive schema, privacy digest key, access/request/audit records,
  deleted-identity markers, order guards and completed revocations. Do not roll
  back to pre-guard code or drop privacy tables after any real request/deletion.
- The iOS app fails safely with “request not confirmed” and retains its local
  status credential for retry. Existing authenticated status remains available
  only while the route is enabled; plan incident communication accordingly.
- If a provider is unhealthy, disable only that channel; do not redirect to a
  customer-typed contact or treat provider acceptance as receipt.
- A database restore must restore/reapply deleted-identity markers, revoked access,
  erased-order guards and completed decisions before traffic resumes. Reconcile
  requests received after the restored snapshot. Never test rollback on production
  customer data without an approved recovery exercise.

## Verification

`privacyDelivery.test.js` uses mocked Resend/Twilio transports and covers flags,
timeouts/idempotency inputs, managed phone checking, malformed/unapproved responses,
credential redaction and the ADMIN allowlist. `privacyDeletion.database.test.js`
requires `NODE_ENV=test`, `PRIVACY_SYNTHETIC_DATABASE=yes`, a loopback host and the
exact database name `speedy_privacy_synthetic`; its preparation script applies the
pinned pre-feature baseline and both review migrations. It covers enrollment,
phone-only delivery, superseded challenges, duplicate contacts, expiry/attempts,
durable limits, recovery, holds, stale previews, rollback, redaction, guard triggers,
completion and unaffected customers. No production database URL is accepted.

Local TypeScript/Prisma/mock checks pass. This Mac has no local PostgreSQL runtime,
so the updated transaction suite must pass the guarded draft-PR CI job before the
branch is considered verified. A passing review branch is not deployment approval.
