# Isolated email privacy test

This is the Stage A review runbook for one real Resend verification email and the
DEBUG-simulator account-deletion flow against the exact disposable synthetic Render
service/database. Stage A creates no cloud resource, database row or provider message.
Stage B remains separately approved and must use exact reviewed backend and iOS heads.

## Fixed boundaries

- Production `speedy-api`, its database, its four privacy gates, its recovery journal
  and all customer records are never targets. Auto-Deploy stays off.
- Exact isolated origin: `https://speedy-privacy-isolated.onrender.com`.
- Exact isolated service/database identities remain those in the prior Twilio runbook.
  Their existence, state, price and configuration must be re-established read-only.
- One Resend verification attempt maximum; zero SMS, order, dispatch, push,
  promotional or completion messages. The server consumes the allowance before the
  provider call, so an unknown result cannot be retried.
- Email mode requires deletion/email true, phone/fulfillment false, the reviewed
  sender, and no Twilio, AWS/recovery, dispatch, B&D, Firebase, AI or unrelated keys.
  The synthetic service uses a process-local enrolled recovery journal. A restart
  after fixture creation refuses startup because the database is no longer empty.
- Private fixture values and all control/tracking/admin/provider/database credentials
  use only masked dashboard controls or hidden terminal input. They do not enter Git,
  chat, arguments, clipboard evidence or logs.
- The hidden normalized email must match the reviewed owner-mailbox digest. The
  server returns only its mask, and the bootstrap prints that mask before accepting
  `ARM ONE EMAIL`; a mismatch stops before a provider request is possible.

## Stage A artifacts

- `privacyIsolatedServer.cjs`: single-use EMAIL mode, exact target/gate checks, one
  fixture and one message allowance, synthetic recovery, sanitized outcome routes.
- `privacyIsolatedEmailFixture.cjs`: hidden input and explicit no-message fixture
  authorization; saves a mode-0600 local control record.
- `privacyIsolatedSimulatorBootstrap.cjs`: writes only order ID/tracking token to a
  mode-0600 file in the booted simulator container after `ARM ONE EMAIL`.
- `privacyIsolatedEmailEvidence.cjs`: before cancellation, proves source preview,
  fulfillment-disabled and unchanged records; after iOS cancellation, accepts only
  one sent/verified challenge, one durable access credential, one cancelled request
  and unchanged customer/order records. Output is sanitized.
- iOS code on its separately reviewed head: DEBUG + Simulator only, exact isolated
  origin, protected import, real account-deletion UI/model/service and a visible red
  isolated-test banner. Release builds contain neither the origin nor arming controls.

## Stage B sequence (not authorized by Stage A)

1. Recheck production source/deploy/settings, normal health, all four gates false and
   Auto-Deploy Off. Re-resolve the isolated identities and inspect their exact state.
   Isolated startup must audit every public application table and accept only the
   complete empty schema; missing tables or any unexpected row stop startup.
   Any concurrent material change, unknown row or unexpected cost/configuration stops.
2. If the prior disposable rows remain, stop. The existing destructive reset
   deliberately rejects the completed email-flow shape. Exact-state reset/resource
   cleanup requires a separately reviewed target/state/cost package and approval.
3. Deploy only the exact reviewed backend head to the isolated service with EMAIL
   mode and the environment boundary above. Confirm authenticated preflight reports
   an unused fixture, email true, phone/fulfillment false. Unauthenticated access must
   remain the sanitized 404.
4. Run `npm run privacy:isolated:email:fixture`. Enter private values only in the
   foreground hidden-input terminal. Type `PREPARE ISOLATED FIXTURE` only after the
   zero-message preflight. This creates exactly one Customer, one delivered iOS Order
   and one non-login ADMIN in the isolated database and sends no message.
5. Build/install the exact reviewed DEBUG simulator app, run
   `npm run privacy:isolated:email:bootstrap`, confirm the displayed masked owner
   mailbox, type `ARM ONE EMAIL`, then launch the app. The app must show the red
   isolated-test banner and delete its import file.
6. In the real Delete Account UI, confirm the masked owner mailbox. The owner action
   that requests the code is the single-message authorization. Do not tap it again.
   If the outcome is unknown, stop; never resend. Enter the received code only in the
   app, submit one request, and verify its status and due date.
7. Run `npm run privacy:isolated:email:evidence` once while status is `SUBMITTED`.
   Require `SPEEDY_ISOLATED_EMAIL_PRE_CANCEL`, `pass=true`, exactly one order whose
   source ID matches the protected order, no active/unlinked/conflicting orders,
   `FULFILLMENT_DISABLED` and unchanged-record evidence. It performs no fulfillment.
8. Cancel in the iOS UI, refresh to `CANCELLED`, then run the same evidence command.
   Require `SPEEDY_ISOLATED_EMAIL_FINAL`, `pass=true` and the exact bounded counts.
9. Launch the DEBUG simulator app once with `--clear-isolated-privacy-test`. Cleanup
   proceeds only when the armed marker matches the active isolated order; it clears
   only that order and isolated privacy/status credentials. Verify the production
   origin/configuration was never changed.
10. Record only sanitized revision/resource/time/result evidence. Robert confirms
    receipt, then deletes the verification email and confirms removal from the mailbox
    and his synced devices. Do not claim provider-backup deletion.
11. Disable isolated deletion/email routes and stop the service. Do not reset/delete
    rows or resources without the separate destructive approval. Reverify production
    live/ready, privacy route unavailable, all four gates false, Auto-Deploy Off and
    no production deploy/database/message change.

The proposed 2026-10-30 22:00–23:30 America/Toronto window remains a proposal until
Robert approves Stage B for the exact tested heads and current isolated-resource
preflight. Reserve 23:00–23:30 exclusively for cancellation and safe shutdown.
