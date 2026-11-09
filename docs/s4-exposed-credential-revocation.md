# S4 exposed credential revocation — preparation only

Reviewer readiness remains **PASSED**. No production change occurs in this PR.

## Targeted operation

The singleton owner ADMIN calls
`POST /api/v1/orders/synthetic-safety/revoke-exposed-credentials` once with:

```json
{"ownerConfirmedSynthetic":true,"expectedExpiresAt":"2026-11-16T14:47:30.000Z","expectedOrdersCreated":1,"expectedEmailsClaimed":2}
```

Caller-supplied tokens, profile fields and Customer/Order IDs are rejected. Under
the privacy-identity then policy locks, the service resolves the linked synthetic
subject and sole protected order. It requires ACTIVE/unexpired policy, correction
audit, exactly 1/6 orders and 2/3 emails, matching profile fingerprints, SMS opt-out,
zero loyalty, no receipt/driver/dispatch/pickup and no deletion request. Drift stops.

One transaction clears the sole order's tracking hash/expiry and records a
subject-scoped SystemSetting tombstone with actor/time/source order/loyalty iat
cutoff. The policy value stays byte-identical. Customer, access, challenges,
allowances and expiry stay unchanged; Prisma updates the order's normal updatedAt.
Both loyalty consumers (rewards and email bootstrap) reject that subject's old,
missing-iat or same-second tokens; newer signed tokens and other customers work.
Keep the tombstone after policy expiry: loyalty JWTs last 365 days. Corrupt records
fail closed. No schema migration, dependency, shared-key rotation or iOS change.

## Reviewer access

Exposed tracking loses tracking/check-in/email bootstrap. Exposed loyalty loses
rewards/email bootstrap. The independent privacy-access row remains valid; the
browser cleared its plaintext, so it is not an importable reviewer credential.
The owner privately supplies the corrected profile. In existing Release 1.0 (5),
Account -> Protected test ordering ON, a later authorized protected order obtains
fresh app-held credentials. Start after the revocation second has passed (JWT iat
has second precision). No exposed/staff credential is transferred. Five orders and
one email remain; reserve that email for the agreed live call. No new production
order/email is authorized by this preparation. Verify and request deletion in
Build 5 opens confirmation; Submit deletion request verifies AND submits a real
case. No deletion case is a preparation check. Physical-iPhone testing remains a
disclosed validation gap; completed R1/S3/Phase B/Build 5/S4 evidence is preserved.

## Tests and production approval sequence

Unit tests cover cutoff boundaries, unrelated subjects, malformed state/outage and
owner/body scope. Real isolated PostgreSQL tests cover both token consumers,
tracking/check-in, atomic rollback/replay/concurrency, unchanged policy/Customer/
access/challenges, fresh app credentials/mocked email-code verification, ordinary
ordering, stale/closed/expired policies, and queued email/order locks. Required
validate/privacy-database CI must pass at the exact candidate. No real provider.

1. Review the exact PR head/CI. Obtain separate normal-merge approval; record the
   actual integration SHA/parents, not the open PR's test merge reference.
2. Baseline: dep-dboulbe417fc739ev58g /
   e6d13f4d940f12ed9a267cb1d4f7b025af6f7e9e; healthy; Auto-Deploy off; pre-deploy
   empty; flags true/true/false/true; mailbox unchanged privately; ACTIVE policy,
   original expiry 2026-11-16T14:47:30.000Z, 1/6 orders, 2/3 emails, one safely
   cancelled protected order, one verified access result, no requests. Drift stops.
3. Separately approve API-only deployment of that exact integration and verify
   live ID/SHA/health/flags/policy. No migrations/config/website/dispatcher/iOS work.
4. Separately approve the one owner operation after fresh read-only state/session
   checks. Bind the helper to the actual SHA and a 12-hour window. Unknown response
   means inspect ledger/hash absence read-only, never automatically retry.
5. Confirm hash/expiry null, tombstone cutoff after original issuance, unchanged
   policy bytes/expiry/counters, same Customer/access/challenges and no request.
   Do not replay exposed live values as verification; use reviewed fixture tests.
6. After confirmed containment AND usable private reviewer access, the owner's
   conditional authority permits saving final review notes and publishing the
   existing 14 approved privacy answers, with preview/readback and Build 5 retained.
   No App Review submission. The erased browser secret cannot establish a device
   session; obtain separate order/email authorization if demonstrating fresh
   app-held access requires those actions. This PR does not grant it.

## Recovery limit

Before revocation, deployment failure can restore the captured baseline. After
revocation, old API code ignores the tombstone and reactivates the old loyalty JWT.
Tracking remains cleared but containment is incomplete. Preserve tombstone/null
hashes; prefer a reviewed forward fix retaining both checks. Any emergency old-code
rollback needs a concrete containment decision and paused handoff. Do not delete
Customer data, restore exposed hashes, rotate shared keys or reset allowances.
Clearing screenshots/history is not revocation. Residual exposure acceptance is
not the proposed solution.
