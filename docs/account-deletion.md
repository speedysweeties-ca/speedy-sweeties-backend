# Customer account deletion — review implementation, not deployed

Based on backend `12b78cc4780c96efa286c167c63ac1676dfc5dbb`. Work is confined to
`review/customer-account-deletion`. Do not merge or deploy until the gates below
are resolved. No real customer data, production migration, delivery or provider
request was used during development. The dispatcher lives in this same repository.

## Customer and administrator flow

The iOS Account screen explains consequences and offers verification against an
existing contact. A challenge has an eight-digit random code, ten-minute expiry,
five guesses and a durable five-per-hour contact/requester limit. Unknown,
ambiguous, unverified and delivery-failed contacts receive the same response.
The code digest is keyed; codes, status credentials and provider responses are
not returned in errors or audit events. No loyalty token is accepted as proof.

Only an independently verified, unique email already recorded on the Customer
can receive a code. The public order's supplied email is not sufficient. The new
`privacyVerifiedEmail` and `privacyVerifiedEmailAt` fields have no public write
endpoint and are not backfilled. Contact changes invalidate proof. This is NOT
a claim that existing customers have such verified channels. There is no SMS
transport. Phone-only and ambiguous/recycled/shared contacts need an approved
verification method before rollout. Do not populate verification fields merely
because an email appeared in an order. The existing Resend integration is reused
behind an explicit off-by-default gate and tested through an injected mock.

After explicit confirmation, the client persists a random request ID/status
secret in its separate Keychain namespace before submitting. Retrying the same
request is idempotent. A consumed proof cannot create another request. Status
access and cancellation require that request secret, not a phone or loyalty token.
`SUBMITTED` is receipt, not completion. Cancellation remains possible until the
fulfillment transaction wins the shared lock. An active order prevents fulfillment
but does not prevent submission. A lost device/status credential currently needs
assisted, independently verified recovery; there is no public credential-recovery
endpoint. A new request after cancellation also needs a new verification flow.

The dispatcher Privacy requests page requires current staff authentication, ADMIN
role AND an explicit privacy-administrator ID allowlist on the server. Ordinary
dispatchers cannot use it. It shows a read-only impact preview, audit trail,
retention decision fields and external-work checklist. The fulfillment operation
revalidates the preview fingerprint, customer contact, request state/version,
unlinked phone-matching records and active orders inside a transaction. Unlinked
records cause a hold; they are not swept based on a guessed shared phone/email.
No automatic relinking/identity adjudication is implemented for those holds.

## Fulfillment and retained records

The database transaction removes the Customer (including its RetentionMessage
cascade), eligible copied contact/address/unit/buzz/geocode/notes and attribution
data in linked Orders, help/check-in records and linked dispatch/pickup/edit-pause
history. Receipt notes and staff creator references are cleared. Item free text
and catalog links are redacted; quantities, prices and receipt totals remain.
Structural record IDs, financial timestamps, order/payment status and amounts are
retained, as explicitly listed in the validated decision. This test-supported
redaction profile is NOT an assertion that it satisfies Robert's tax obligations.
If different personal fields are legally necessary, do not enable this version:
review and extend the decision/redaction profile first.

Financial retain-until is stored per erased order; policy reference, justification,
request/audit retention date and anti-recreation identifier review date are recorded
per case. There is no default real retention period. The UI supplies no date defaults.
Production fulfillment additionally requires the supplied reference to match the
explicitly configured approved retention policy. Expiry enforcement/purge and an
overdue-retention review worker remain to be implemented and approved before
production fulfillment; recording dates alone is not an operational retention policy.

Order push/tracking credentials are cleared, the old Customer ID stops working for
loyalty, and both legacy-ID and token tracking reject erased records. A shared
transaction lock and keyed deleted-identity marker block old public/manual/order-
edit requests from recreating that phone identity. Retained orders and their receipt,
item and help writes are protected with database triggers. Newly verified re-enrollment
and safe key rotation require a separate reviewed workflow; no automatic expiry of
the suppression marker restores authority. Its hash-key fingerprint makes key changes
fail closed rather than accidentally bypassing deletion protection.

After the DB transaction, status remains `FULFILLING`. Durable tasks cover phones/
synced contacts, messages/email, staff notes/exports, logs/providers and backups/
restore. An administrator must record verified evidence or justified retained-copy
expiry before completion. A checkbox is not provider deletion: these adapters have
no provider access and do not erase backups, telephone history, mailboxes or logs.
Review shared catalog text and any independently copied customer details as part
of the external/manual inventory; there is no safe automatic shared-catalog purge.
Existing provider accounts, actual retention, restore suppression, administrative
exports and other-device copies remain unverified. Never attest them without evidence.

Completion and retained-record details are available in authenticated in-app status.
No email/SMS completion notification is sent. A separate delivery/recovery design
is needed for customers who cannot return to the installation. The iOS client clears
only its listed profile/history/favourite/reward/credential data after confirmed
completion, withdraws voice consent, rejects stale callbacks and reports Keychain
cleanup failure for retry. OS permission state and unrelated settings are untouched.

## Configuration gates — document only; none configured

- `PRIVACY_DELETION_ENABLED=true`: makes request routes available after migration.
- `PRIVACY_ADMIN_USER_IDS`: approved ADMIN staff IDs; default empty, no access.
- `PRIVACY_VERIFICATION_EMAIL_ENABLED=true` and `PRIVACY_VERIFICATION_FROM`: only
  after approved verified-contact provenance and a suitable sender are established.
  Existing `RESEND_API_KEY` is reused; no key/account was retrieved or created.
- `PRIVACY_DIGEST_KEY`: separate stable server-side privacy HMAC key (not an OpenAI
  key, never in the app). No secret was created/configured. Request-only development
  can use the existing JWT secret fallback; production fulfillment requires this
  dedicated key. Changing it after deletion needs a reviewed migration. Keep it
  available to restoration/revocation operations; protect it from source/logs.
- `PRIVACY_APPROVED_RETENTION_POLICY`: approved policy reference; never a test policy.
- `PRIVACY_FULFILLMENT_ENABLED=true`: still subject to all preceding decision gates.

The identity guard is not switched off with the request UI. Migration must precede
deployment because order creation reads the new table. Do not roll back to pre-guard
code after any deletion. Restore procedures must restore/reapply revocations before
serving traffic. No production deployment/rollback/migration was performed here.

## Synthetic testing

`tests/preparePrivacyDatabase.cjs` rejects anything except `NODE_ENV=test`, explicit
`PRIVACY_SYNTHETIC_DATABASE=yes` and a loopback database named
`speedy_privacy_synthetic`. It builds the pinned pre-feature baseline and applies
the real new SQL migration. Historical unrelated migrations omit fields; this does
not silently repair or rewrite those migrations. Production rollout needs its own
schema-drift review. `privacyDeletion.database.test.js` exercises real transactions,
holds, attempts, replay, rollback, revocation, races, retained totals and unaffected
customer access. `privacyDelivery.test.js` uses a mocked transport and role checks.
Existing order regression mocks are extended for the new guard, not disabled.

The dispatcher components were renamed from BndOrderAlerts.tsx and
IncomingOrderAlarm.tsx to BndOrderAlertPanels.tsx and IncomingOrderAlarmPanels.tsx
solely to avoid TypeScript resolving their lower-case .ts helper modules on
case-insensitive macOS. Alert logic is unchanged.
