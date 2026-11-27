# Loyalty lookup availability — November 27, 2026

Base: pending backend PR #168 at 892be8fed9a3cecacb83990ff3ff73c5fe29abc3.

`GET /api/v1/customers/loyalty-token` previously returned HTTP 401 for every failure,
including database errors. Customer Android main treats 401/403 as permanent access
rejection and removes the saved credential. Its existing 503 path retains the
credential and last known balance for a later retry. Source was reviewed in
`OrderRepository.kt` and `LocalOrderStore.kt`; the mobile suite was not rerun here.

The controller now verifies the token separately. Missing, malformed, expired and
wrong-scope tokens still return 401. Explicit synthetic credential revocation,
corrupt revocation records and a successfully confirmed missing customer still
return 401. If the revocation database lookup or loyalty snapshot transaction fails,
the response is HTTP 503 with code `LOYALTY_TEMPORARILY_UNAVAILABLE` and a generic
retry message. The response exposes no internal database error or balance.
Revocation lookup failure never bypasses revocation or returns success.

Eight new tests cover success, invalid credentials, revocation/corrupt records,
revocation lookup outages, snapshot outages and recovery with the same token,
missing customers, stage-specific error classification, and the actual HTTP route.
Database operations are stubbed for controlled fault injection; these tests do not
claim a live database outage or physical-device result.

Local validation on Node 24.22.1: backend `npm run check` passed (688 tests passed,
18 guarded database tests skipped); dispatcher `npm run check` passed (86 tests,
lint and production build). Prisma generation/validation and `format --check`
passed. Both clean dependency installs and security audits passed with zero
reported vulnerabilities. Dispatcher-help review and whitespace checks passed.
The dispatcher build retains its existing bundle-size advisory.

No reward counts, eligibility, free-delivery rules, receipt adjustments or card fees
were changed. This does not restore credentials already removed by older 401
responses. No new retry loop, mobile release, schema migration or environment
variable is required for this change. The existing stacked receipt/delivery fixes
and their deployment prerequisites remain; this branch has not been deployed.

Dispatcher help review: `customer-profile` was re-reviewed; its staff-visible
profile/address steps remain correct and unchanged. Example question: “How do I
change a customer's saved profile or address?” The updated review date records the
internal controller change without adding a nonexistent dispatcher control.
