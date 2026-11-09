# S4 unused-policy address recovery package

Status: source review only. This document does not authorize merge, deployment,
configuration changes, policy correction, an order, an email/SMS or App Store work.

## Preserved baseline and diagnosis

- Running baseline observed for the stopped execution: deployment
  `dep-dbon27ajnfac73fe4atg`, source
  `17a428f7f4befafcd97035cc8dbfdea492fd3824`.
- The policy remains ACTIVE until `2026-11-16T14:47:30.000Z` with 0/6 orders,
  0/3 email claims, no linked Customer and zero protected orders.
- The one order request returned HTTP 400 in the exact shape used for
  `INVALID_DELIVERY_ADDRESS`; read-only state proves it committed no order/customer
  and consumed no allowance. Private civic-address text was not logged or retained.
- Source confirms the gap: enrollment did not call the native order geocoder. The
  order did, before its transaction, and stopped. The supported root cause is the
  missing pre-enrollment address verification—not a guess about a private token or
  the provider's reason for rejecting it.

## Exact-revision API-only rollout (separate approval required)

1. Require normal review and both required CI jobs passing on the exact PR head.
   Record that candidate SHA and the merge integration SHA; never deploy “latest”.
2. Read-only verify the current API deployment/source, healthy live/ready routes,
   Auto-Deploy Off, empty pre-deploy command, approved-mailbox validity, unchanged
   request/email/fulfillment=true and phone=false flags, and the exact unused policy
   baseline above. Stop if the policy expired or any counter/link/order changed.
3. Deploy that exact integration SHA to `speedy-api` only. Do not run migrations or
   change configuration. Verify the exact live SHA, health, flags, route ADMIN
   protection and unchanged policy state before any correction.
4. Rollout failure before correction: restore the recorded known-good deployment
   and verify its source/health/flags. There is no saved-configuration change to
   restore in this package.

## Private in-place correction (separate approval required)

1. In an authenticated singleton-owner ADMIN dispatcher session, privately collect
   the exact current profile and one corrected profile. Do not put either in shell
   arguments, Git, chat, logs, screenshots or evidence. Name, phone, configured
   mailbox, city and province must be identical; only Address Line 1, Unit and Buzz
   may differ.
2. Make at most one POST to
   `/api/v1/orders/synthetic-safety/correct-unused-address` with
   `ownerConfirmedSynthetic:true`, `currentProfile` and `correctedProfile`. The new
   civic address must pass native order validation. On any refusal or ambiguous
   response, stop and inspect policy/audit/order/customer state read-only; do not
   retry automatically.
3. Read-only verify the same policy row/key, original expiry, 6/3 limits, 0/0
   counters, null Customer, unchanged identity/contact/key fingerprints, changed
   profile fingerprint, one `UNUSED_ADDRESS_CORRECTED` actor/time marker containing
   no address, and zero protected orders.
4. A protected readiness order and email claim remain separate mutations under the
   existing authorization. Only proceed after their own fresh business/source/state
   checks; they are not part of deployment or correction.

## Recovery limits

- The correction never extends expiry, resets allowances, deletes/recreates the
  policy or edits a Customer. If expiry occurs first, correction must fail; a new
  bounded enrollment requires a separately reviewed recovery after expiry, not a
  bypass or extension.
- Code rollback does not and must not rewrite the corrected policy hash. The prior
  reader tolerates the additive audit field and will still enforce the corrected
  profile fingerprint, but it has no correction endpoint. Verify compatibility on
  the exact rollback revision before using it.
- If a wrong correction commits, the one-use audit deliberately prevents another.
  Stop. Recovery requires new reviewed source/authorization; do not delete the row,
  clear the audit marker or reset counters manually.
- Once a protected order or email claim commits, rollback cannot unconsume it and
  cannot erase the linked synthetic records. Preserve and report actual state.
