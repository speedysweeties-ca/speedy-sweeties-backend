# Speedy Sweeties Backend Audit — 2026-09-08

## Scope

This audit reviews the current `main` branch as of 2026-09-08 and separates already-completed hardening from remaining work. The Phase 2 work in this branch is intentionally additive and does **not** connect Pickup Locations to automatic driver assignment.

## Phase 2: Pickup Locations — current state

### Already present on `main`

- `PickupLocation` Prisma model exists.
- Migration `20260810201000_add_pickup_locations` exists.
- Postal code was made optional in `20260902000000_make_postal_codes_optional`.
- Authenticated staff API exists for list/create/update/deactivate.
- Dispatcher UI already contains Pickup Location management.
- Driver order responses can build a `routingPlan` containing candidate pickup locations.
- Item Catalog already stores `pickupType`.

### Important boundary

Current automatic assignment still chooses the least-busy fresh online driver. It does **not** use Pickup Locations when selecting a driver. This branch intentionally preserves that behavior.

### Phase 2 hardening added on this branch

- Central pickup-type definitions added in `src/constants/pickupTypes.ts`.
- Pickup Location create/list/update now reject unsupported pickup types.
- `UNKNOWN` is rejected for a real Pickup Location.
- Optional `postalCode` is now actually persisted by create/update.
- Update can explicitly clear `postalCode`.
- Regression tests added for these behaviors.

### Remaining Phase 2 work

1. Populate real Guelph Pickup Location records.
2. Confirm each location's coordinates and active status.
3. Add stronger uniqueness rules or duplicate-detection policy once the real dataset is known.
4. Add integration/API tests for authenticated Pickup Location routes.
5. Reconcile driver `routingPlan` pickup-type support with the catalog's current values before any driver-routing UI depends on it.
6. Only in a later phase, design how pickup distance and driver workload should influence auto-dispatch.

## Backend audit — items already fixed

The current code shows the following older findings are no longer open:

- Helmet is enabled.
- Production request logging omits URLs to avoid leaking token credentials.
- Login is rate-limited.
- Public order creation is rate-limited.
- Public tracking is rate-limited.
- Public order creation checks confirmed business-closed state.
- Secure tracking tokens exist and expire after 48 hours.
- Dependency advisory PR #1 recorded `npm audit --json` with 0 vulnerabilities.
- Dispatcher attribution / dispatcher name history was merged in PR #4.
- Driver freshness checks are used in live driver listing and auto-dispatch filtering.
- Receipt components are validated and grand total must equal the component sum.
- Driver receipt creation is restricted to the assigned order.

## Backend audit — remaining findings

### High priority

#### 1. Public legacy UUID tracking remains enabled

`GET /api/v1/orders/track/:id` remains public for backward compatibility with older Android Customer versions. The newer token route is safer. Remove the UUID route only after the current Android customer release is confirmed to use tracking tokens.

#### 2. Public order creation is not idempotent

The order endpoint is rate-limited, but a retry/double-submit can still create duplicate orders. Add a client-generated idempotency key or equivalent duplicate-request protection after app/web clients can supply it safely.

#### 3. Legacy staff status endpoint allows broad status jumps

`PATCH /orders/:id/status` prevents some bad cases (for example cancelling a delivered order) and uses optimistic concurrency, but it does not enforce one strict transition graph for every state. Because the route is staff-only and marked legacy, tighten this in a compatibility-aware change rather than silently changing live behavior.

#### 4. Notification registration endpoint does not persist tokens

`POST /notifications/fcm-token` currently validates presence, logs receipt, and returns `"Token saved"`, but does not write the token to persistent storage. Order-specific FCM tokens still work because order creation stores them. The standalone registration endpoint is misleading and should either persist tokens or be removed once client usage is confirmed.

### Medium priority

#### 5. Manual driver assignment does not require a fresh/online driver

The dispatcher UI lists freshness-aware drivers, and auto-dispatch filters for fresh online drivers. The backend manual assignment endpoint itself accepts any active visible driver and does not enforce freshness/online state. This may be intentional to let dispatch override availability; document that policy or add an explicit override model instead of relying on UI-only behavior.

#### 6. Driver freshness threshold is one hour

`DRIVER_FRESHNESS_THRESHOLD_MS` is currently 60 minutes. Since driver heartbeat runs much more frequently, one hour is generous and could leave a stale driver appearing available for longer than desired. Changing this affects live assignment behavior, so it should be tested separately.

#### 7. Pickup-type definitions are inconsistent across modules

The Item Catalog recognizes `UNKNOWN`, `CONVENIENCE`, `BEER_STORE`, `LCBO`, `VAPE`, and `DISPENSARY`. `driverOrders.controller.ts` currently defines routable pickup types as `CONVENIENCE`, `GENERAL_RETAIL`, `GROCERY`, `PHARMACY`, and `OTHER`. This means the driver routing-plan helper can treat several actual catalog values as unsupported. Do not connect this helper to live dispatch until the vocabulary is reconciled.

#### 8. Duplicate route file should be reviewed

Both `src/routes/orders.ts` and `src/routes/order.routes.ts` are present in the repository. `src/routes/index.ts` imports `./orders`. The older route file should be reviewed and removed if it is truly dead to reduce maintenance risk.

### Lower priority / cleanup

#### 9. Development-only test notification route is still mounted

The route returns 404 in production, so it is not currently an exposed production sending endpoint. It is still mounted and retains in-memory token code. Consider removing it once no longer needed for development.

#### 10. Auto-dispatch workload counting can be optimized later

Current least-busy selection performs one active-order count query per eligible driver. With a small driver pool this is acceptable. If the fleet grows, replace this with a grouped aggregate query.

## Recommended next safe sequence

1. Merge only the Phase 2 CRUD validation changes after CI passes.
2. Populate Pickup Location data separately.
3. Verify Android Customer uses token tracking, then retire legacy UUID tracking.
4. Add order idempotency.
5. Decide whether the one-hour driver freshness threshold should be reduced.
6. Reconcile pickup-type vocabulary before expanding driver routing.
7. Design Phase 3 auto-dispatch using pickup locations, distance, workload, and manual fallback as a separate change.

## Explicit non-changes in this branch

- No change to current auto-dispatch selection logic.
- No change to the Auto Dispatch on/off setting.
- No change to driver assignment rules.
- No production database writes.
- No Pickup Location seed data inserted.
- No Render configuration changes.
- No main-branch merge.
