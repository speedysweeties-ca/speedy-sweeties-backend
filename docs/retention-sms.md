# 90-day SMS integration — prepared, not activated

The cron still defaults to DRY_RUN. This change adds a separate Twilio Programmable
Messaging connection; it does not reuse or enable Twilio Verify or privacy gates.
No live SMS, provider configuration, migration or production deployment was performed
while preparing this change.

## Behavior

The existing scan creates draft records. TEST/LIVE can send only eligible drafts
whose eligibleAt is on or after RETENTION_SMS_START_AT, inside 10:00–19:59
America/Toronto. TEST additionally requires exact E.164 allowlisted recipients.
Each run selects at most RETENTION_SMS_MAX_PER_RUN (default 10, maximum 100).
This is a per-run cap, not a provider spending limit. Old drafts are not automatically
backfilled. Use a launch timestamp to exclude them; widening that timestamp is a
separate backlog decision. Stale/ineligible candidates are marked suppressed and never sent; inspect
counts rather than assuming the whole queue is drained.

Eligibility is rechecked before claiming: last delivered-order anchor unchanged,
90 days elapsed, current phone unchanged, no opt-out, and existing recorded consent
basis still valid under the existing retention rules. Pending privacy requests and
newer completed orders on a shared-phone profile also block a draft. These technical checks do not
independently verify legal consent. Approve the audience and complete message/contact
wording before activation. No promotional discount is assumed.

A database transaction locks a per-phone recipient record and claims the message
before contacting Twilio. HMAC-keyed SystemSetting records retain opt-out state and
last attempt time, without a plaintext phone. They suppress attempts to that number
for 90 days across duplicate customer profiles. Keep the suppression secret stable
across API and cron and across releases; losing/rotating it loses lookup continuity.
These suppression records intentionally survive customer deletion to prevent future
contact. RetentionMessage remains linked to the customer and follows existing deletion.

A claimed attempt is never automatically retried. A timeout, ambiguous response or
process interruption requires operator reconciliation with Twilio before any manual
action. Do not reset attemptedAt or switch FAILED back to DRY_RUN. The sending
claim initially uses FAILED/SEND_IN_PROGRESS as an existing non-sendable status;
providerStatus and attemptedAt distinguish it from confirmed rejection. SENT means
provider accepted, not delivered. Signed callbacks populate providerStatus, including
delivered/undelivered/failed; terminal or older events cannot overwrite newer evidence.
There is a small unavoidable interval between the final opt-out check and provider
submission; Twilio Advanced Opt-Out must also enforce STOP at the provider.

## Deployment and controlled activation

1. Require backend CI and privacy-database CI on the exact review head. Review the
   additive migration: only two nullable RetentionMessage fields are added. No old
   drafts are promoted or erased. Backend API and cron must use the migrated schema.
2. Deploy API and cron with RETENTION_SMS_MODE=DRY_RUN and
   RETENTION_SMS_ENABLED=false. Preserve all unrelated privacy and Auto-Deploy settings.
   Follow docs/release-checklist.md; this preparation is not a deployment claim.
3. Privately configure the dedicated RETENTION_TWILIO_* values using the actual
   account and an SMS-capable sender in a Twilio Messaging Service. Confirm account,
   Canada sending permissions, sender readiness and provider spend limits. Do not
   assume a working Verify service proves Messaging readiness. No credentials in chat.
4. Set RETENTION_SMS_WEBHOOK_BASE to the actual API base ending
   /api/v1/retention-sms. Set the service incoming-message webhook to
   <base>/inbound (POST), enable Advanced Opt-Out, and verify its STOP behavior.
   Outgoing requests include <base>/status/<message-id>. The exact public URL is
   used for signature validation; proxy/host headers cannot override it. Keep API
   credentials/webhook settings configured even if sending is subsequently disabled.
5. Configure a stable independent suppression key on API and cron; an approved
   message body with business/contact details and “Reply STOP”; a launch timestamp;
   maximum batch size; and TEST allowlist containing only the owner's confirmed test
   destination. Test against a separately authorized synthetic fixture, not customer
   records. Do not alter production order dates to manufacture eligibility.
6. Obtain approval for the concrete one-message test destination, wording and cost
   before setting TEST/enabled. Verify receipt, signed delivery callback and STOP
   suppression, including a later run that sends nothing. Returning START must not
   silently restore application marketing consent. Existing suppression stays set.
7. Only after that evidence and the actual audience/wording are approved, switch to
   LIVE/enabled with the reviewed start timestamp and small batch cap. Inspect counts
   and delivery failures. If anything is uncertain, set enabled=false (job fails
   closed) or mode=DRY_RUN (draft scan continues). Leave inbound callbacks running.

## Review and verification

How do I guide: customer-retention. Example: “Does Customer Retention automatically
text customers?” Manual Call/Text/Email controls and navigation are unchanged.

Synthetic unit and PostgreSQL tests cover configuration gates, recipient claims,
concurrent jobs, restarts, STOP, ambiguous send outcomes, provider rejection,
signature tampering, quiet hours and out-of-order delivery evidence. Tests use fake
provider responses and make no Twilio requests. CI's existing disposable PostgreSQL
setup applies the actual new migration; no production database is used.
