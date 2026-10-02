# Private ChatGPT production pilot — prepared, not activated

Prepared October 2, 2026 UTC from production main `e27e00d466655492dc2b2ad157ed6baf01962815`. This branch is a reviewable proposal. It has not been merged or deployed to speedy-api, and no production order was sent.

## Customer behavior

The owner-private ChatGPT Site adds six real-order tools and `/live`, hidden/disabled without a separate activation flag and secret. The existing `/order` and staging tools stay synthetic. Customers need their own authenticated ChatGPT/Site access, not dispatcher credentials.

Initial scope: four exact catalogue IDs/names (ice, Canada Dry Ginger Ale 2L, Cheese Doritos and four-pack toilet paper), Guelph, Ontario. Quantities are bounded; only enumerated delivery instructions are allowed. No regulated products, arbitrary item requests or substitutions are accepted. A real order requires actual contact/address details, a full review and separate sharing, unknown-final-total/pay-at-door and real-order acknowledgements. Edits invalidate confirmation; reviews expire after 30 minutes.

Policy `guelph-pay-at-door-2026-10-01-v1` discloses store prices, delivery C$10.64 plus HST, debit surcharge C$0, Visa/Mastercard surcharge C$5, applicable taxes and the final receipt payable at the door. Item prices and stock are unknown. These are the dated business terms, not a computed quote. Existing numeric estimate fields remain zero placeholders with explicit notes; only a completed backend receipt supplies the final amount. No card details or payment collection are introduced. Contact Speedy Sweeties for changes/cancellation; cancellation after dispatch is not guaranteed.

## Backend routes and boundaries

All routes are under `/api/v1/chatgpt` and require a dedicated server-only Bearer key (at least 32 characters) plus `X-Speedy-Customer`, a 64-character hexadecimal pseudonym derived by the Site from its authenticated owner identity. Do not expose the key to customers or accept a user-supplied owner header in the Site.

- `GET /availability`: policy, allowlisted items and readiness. Ordering requires the explicit enable flag and matching policy version, exact live catalogue identity/name matches, and verified Google Places hours reporting open. The ordinary backend's open fallback is deliberately insufficient for this gateway. Stock remains unverified.
- `POST /orders`: strict reviewed payload, UUID request key and consent. This calls the existing public order controller with normal validation/dispatch behavior after the gateway checks.
- `GET /orders/:request_key`: owner-scoped status and receipt total. No contact fields, tracking/loyalty credentials or driver location are returned. Status remains readable when the backend enable flag is false if the key is retained.

Request limits are per authenticated pseudonym and process (60/minute overall, 10 submissions/15 minutes), appropriate for the private owner pilot. Before public access, evaluate global/distributed abuse controls and business service-area verification; a literal city field is not geocoded proof that an address is in range.

## Atomic order linkage and retry behavior

An existing `SystemSetting` row reserves `chatgpt-order-v1:<request UUID>` with owner pseudonym, payload hash, consent and state. It contains no extra plaintext contact details. The reservation is durable before order creation. A trusted internal callback writes the order ID and complete state inside the existing order transaction, before automatic dispatch or notifications. Mapping failure rolls back customer and order writes. Ordinary public/manual controller callers do not pass the callback.

A successful order whose post-commit notification fails is recovered from that mapping. An unknown pre-commit failure remains pending for reconciliation. Concurrent or repeated submissions never call the order controller twice for a reserved key, including after restart. Reusing a key with another owner or payload is rejected. The Site also atomically claims a draft and performs read-only reconciliation after uncertainty. It never automatically posts an uncertain order again.

No Prisma migration is needed: the gateway uses the existing `SystemSetting` model. The Site adds its separate `live_orders` D1 table with an append-only migration.

## Activation runbook — requires business approval

1. Approve the private owner pilot, the above terms and data handling. This changes an explicitly confirmed order from synthetic testing to a real order that can auto-dispatch and notify a driver. Keep the Site owner-private; this is not public distribution approval.
2. Review and merge this branch only when ready. Production service `srv-d7ntlnpkh4rs73bev9q0` auto-deploys main. Initially leave `CHATGPT_ORDERING_ENABLED` unset/false. Verify the deployment is healthy and the gateway rejects missing credentials.
3. Generate a new dedicated secret through an approved secret channel. Configure Render `CHATGPT_ORDERING_API_KEY` and Site secret `SPEEDY_LIVE_API_KEY` with the same value. Never copy it to source, logs or chat. Do not reuse or rotate the staging key for this task.
4. Configure Render `CHATGPT_ORDERING_POLICY_VERSION=guelph-pay-at-door-2026-10-01-v1`, then `CHATGPT_ORDERING_ENABLED=true`. Redeploy as required; verify authenticated availability is actually open with the exact catalogue. If hours cannot be verified, stop and fix the business-hours configuration rather than weakening the gate.
5. Set Site `SPEEDY_LIVE_ORDERING_ENABLED=true` and republish the exact private Site source. Confirm the six additional real tools are discovered. The origin is pinned to `https://speedy-api-lbfe.onrender.com`; there is no user-editable production URL.
6. Have the owner explicitly review and confirm one real order through the plugin/page during operating hours. Record its Site UUID and backend order number. Verify exactly one production order, dispatcher/driver handoff, status through ChatGPT, final receipt and fulfillment. Do not manufacture a customer's confirmation or mark an undelivered order delivered for testing.
7. Complete unresolved public launch work before inviting customers: actual service-area enforcement, real pilot evidence, business support/retention policy, operational readiness and current platform distribution/review requirements. The private plugin's existing connection does not imply a public listing.

## Pause and reconciliation

To stop new orders while preserving customer tracking, set backend `CHATGPT_ORDERING_ENABLED=false` and redeploy; leave its key and the Site live configuration present. Availability and new submissions stop, but existing status reads continue. Turning off the Site flag hides all real tools and tracking, so use that only for a full shutdown or incident requiring it. Do not delete references or rotate the key just to retry a submission.

For an uncertain request, inspect the exact SystemSetting reservation and mapped order with authorized internal access. Complete mapping plus an order is authoritative; report that order, not a replacement. Pending with no order requires operator investigation of transaction/dispatch logs. Preserve the reservation until absence of an order is established and the customer agrees to any fresh reviewed request. Never replay a pending reservation automatically. Do not dump contact data or credentials into diagnostics.

Site real drafts expire after 30 minutes and are eligible for deletion one day later. Site submitted/rejected copies are eligible after 30 days; uncertain records require manual reconciliation. Cleanup runs on draft/list access. These are Site-copy rules, not deletion of operational backend orders, customer records or receipts. Backend records remain governed by Speedy Sweeties' own policy.

## Evidence and limits

`npm run build` passed. Forty-four focused backend tests passed across `chatgptOrdering`, `customerAddressPersistence`, `criticalOrderProtections`, `orderAddressValidation` and `orderStateTransitionControllers`. These cover authentication, disable/policy/hour/catalogue gates, ownership, replay/concurrency, post-commit failures, real controller field persistence, transaction callback rollback and existing core protections. Tests use fixtures and dummy local connection settings; they do not submit to production. The full backend test suite was not run.

The paired Site has 47 passing tests and TypeScript validation, including real-flow API/MCP/store behavior with fake HTTP. Existing hosted synthetic customer order #10 was independently read back before preparing this branch. No real production round trip or driver fulfillment has been tested yet.
