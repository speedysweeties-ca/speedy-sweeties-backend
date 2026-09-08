# Speedy Sweeties Backend Audit — 2026-09-08

## Scope

This audit started from `main` on 2026-09-08. All remediation work remains isolated on `audit/pickup-phase2-hardening-2026-09-08`. Nothing in this branch changes current automatic driver selection, writes production data, changes Render configuration, or deploys to production.

## Phase 2: Pickup Locations

### Already present on `main`

- `PickupLocation` Prisma model and migration.
- Optional Pickup Location postal code migration.
- Authenticated staff list/create/update/deactivate API.
- Dispatcher Pickup Location management UI.
- Item Catalog `pickupType` field.
- Preliminary driver `routingPlan` candidate support.

### Hardening added on this branch

- Central Pickup Type definitions.
- Official Pickup Type vocabulary standardized as `UNKNOWN`, `CONVENIENCE`, `BEER_STORE`, `LCBO`, `VAPE`, and `DISPENSARY`.
- The five routable types are `CONVENIENCE`, `BEER_STORE`, `LCBO`, `VAPE`, and `DISPENSARY`.
- Legacy routing-only values `GENERAL_RETAIL`, `GROCERY`, `PHARMACY`, and `OTHER` are no longer accepted as official Pickup Types.
- Driver routing requirements now use the same official vocabulary as Item Catalog and Pickup Locations.
- Item Catalog filtering and editing use the shared backend Pickup Type parser, preventing arbitrary strings from being saved.
- Pickup Location create/list/update validation uses the same shared parser.
- `UNKNOWN` cannot be used for a real Pickup Location.
- Optional `postalCode` is now persisted by create/update and can be cleared.
- Regression tests cover the Phase 2 CRUD and Pickup Type rules.

The current Dispatcher UI already presented the same six official values, so no Dispatcher UI vocabulary change was required.

### Guelph Pickup Location dataset prepared on this branch

A researched Guelph seed dataset is now prepared with 56 pickup-location candidates:

- 5 LCBO locations
- 4 The Beer Store locations
- 23 cannabis dispensaries
- 7 vape shops
- 17 strategic convenience locations

The convenience category is deliberately curated rather than attempting to include every gas station or corner store in Guelph. The goal is useful geographic coverage and broadly useful pickup candidates without flooding future routing with low-value duplicates.

The source records live in:

- `src/data/guelphPickupLocations.ts`
- `src/data/guelphConveniencePickupLocations.ts`

A safe seed job is available through:

- `npm run seed:pickup-locations`

The seed job is **dry-run by default**. It does not persist anything unless `PICKUP_LOCATION_SEED_APPLY=true` is explicitly set.

Before a row can be created or updated, the job runs the address through the existing backend Google geocoder. Any address that does not return `VERIFIED` with valid coordinates is skipped rather than guessed.

Existing rows are matched conservatively. An exact normalized civic address is considered the same location. Otherwise, a row is matched only when the normalized store name is also the same and its verified coordinates are within 75 metres. Proximity by itself never merges two businesses, which prevents nearby competing stores from being collapsed into one record.

No production Pickup Location rows have been written by this work.

### Important live-behavior boundary

Current auto-dispatch still selects the least-busy fresh online driver. Pickup Locations do **not** influence automatic driver assignment in this branch.

## Backend hardening completed on this branch

### 1. Legacy UUID tracking exposure removed

The active public `GET /api/v1/orders/track/:id` route was removed. Public customer tracking is now routed through the short-lived token endpoint only: `GET /api/v1/orders/track-token/:token`.

The unused duplicate `src/routes/order.routes.ts` file was also removed because it still contained the old UUID tracking route and could otherwise be accidentally reintroduced later.

### 2. Duplicate public order submissions blocked

Public order creation now receives a persistent 60-second duplicate-submission reservation before the order controller runs.

The reservation:

- fingerprints the order-defining customer/address/payment/item/note data;
- deliberately ignores FCM-token changes so a refreshed push token cannot bypass duplicate protection;
- uses the existing database-backed `SystemSetting` store with an `orderSubmission:` prefix;
- atomically rejects a second identical reservation with `409 DUPLICATE_ORDER_SUBMISSION`;
- deletes expired reservations before reserving;
- releases the reservation when the attempted order ends with an error, allowing a corrected retry;
- requires no Android, iOS, Webflow, or Dispatcher client update.

This protection is intentionally short-lived so a customer can legitimately place the same order again later.

### 3. Legacy staff status endpoint now follows the real lifecycle

`PATCH /orders/:id/status` is still available to ADMIN and DISPATCHER users, but it now rejects skipped or backward transitions.

Allowed forward transitions are:

- `PLACED -> DISPATCHED`
- `DISPATCHED -> ACCEPTED`
- `ACCEPTED -> OUT_FOR_DELIVERY`
- `OUT_FOR_DELIVERY -> DELIVERED`

Cancellation remains allowed from non-final active states. Repeating the current status remains idempotently allowed. `DELIVERED` and `CANCELLED` are final.

The normal driver-action flow is unchanged.

### 4. Standalone FCM registration now really persists

`POST /notifications/fcm-token` now validates and stores the submitted FCM token persistently instead of merely returning `"Token saved"`.

The database key is derived with SHA-256 so the raw token is not embedded in a setting key or log message. Re-registering the same token performs an upsert.

## Older audit findings already resolved before this branch

- Helmet is enabled.
- Production request logging omits URLs containing tracking credentials.
- Login, public order creation, tracking, QR statistics and notification registration have rate limiting.
- Public order creation checks confirmed business-closed status.
- Secure tracking tokens expire after 48 hours.
- Dependency advisory PR #1 recorded zero npm vulnerabilities at the time it was merged.
- Dispatcher-name attribution was merged in PR #4.
- Receipt totals are bounded and component-validated.
- Drivers can only create receipts for their assigned orders.
- Driver freshness is already considered in live-driver listing and auto-dispatch eligibility.

A later CI install on 2026-09-08 reported one moderate npm dependency advisory. It is unrelated to this Phase 2 Pickup Location work and has not been changed in this branch.

## Intentionally not changed

Per the 2026-09-08 instruction, the driver freshness threshold remains unchanged at one hour. No adjustment was made to that policy.

Manual assignment availability rules were also not changed because that would alter dispatcher override behavior and was outside the requested fixes.

## Remaining Phase 2 work

1. Run the 56-location seed in dry-run mode against the real backend environment so Google geocoding can validate every civic address and calculate coordinates.
2. Review any `SKIP`, `CREATE`, `UPDATE`, or duplicate-match result from the dry run.
3. Only after that review, explicitly run the seed with `PICKUP_LOCATION_SEED_APPLY=true` to populate the production Pickup Location table.
4. Verify the resulting rows in the Dispatcher Pickup Locations screen, including active status and map coordinates.
5. Only in a later phase, design pickup-distance-aware routing and automatic assignment.

## Verification

Regression tests cover:

- removal of UUID tracking routes;
- duplicate-order fingerprint/reservation behavior;
- allowed and rejected order-status transitions;
- persistent FCM registration;
- Pickup Location validation and postal-code persistence;
- the official Pickup Type vocabulary;
- rejection of legacy routing aliases;
- driver routing recognition of every official routable Pickup Type;
- Item Catalog rejection of non-standard Pickup Types;
- the 56-location Guelph dataset and category counts;
- dataset name/address duplicate protection;
- prevention of proximity-only merging for nearby competing stores;
- safe matching of the same store across minor address formatting changes.

Backend CI runs the backend test suite in addition to Prisma validation and TypeScript compilation. The full validation for the 56-location dataset passed 80 tests with 0 failures.

## Explicit non-changes

- No current auto-dispatch selection change.
- No Auto Dispatch toggle behavior change.
- No driver freshness-threshold change.
- No production database writes.
- No production Pickup Location rows created or updated.
- No Render configuration changes.
- No merge to `main`.

The current production system therefore remains exactly as it was until this draft pull request is explicitly reviewed and merged later.
