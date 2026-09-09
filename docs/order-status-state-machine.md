# Order Status State Machine

## Previous behavior and bypasses

Before this change, order-status rules were split across auto-dispatch, manual
assignment, driver action, receipt, and the staff status endpoint.

- `POST /orders/:id/driver-action` allowed an assigned driver to transition an
  `ACCEPTED` order to `OUT_FOR_DELIVERY` without checking for a digital
  receipt.
- `PATCH /orders/:id/status` accepted all enum status values and filled in
  skipped lifecycle timestamps. It could therefore make staff-originated jumps
  such as `PLACED -> DELIVERED` or `DISPATCHED -> OUT_FOR_DELIVERY`.
- The receipt endpoint already had the correct row lock and atomically upserted
  a receipt before moving `ACCEPTED -> OUT_FOR_DELIVERY`, but its policy was
  not shared by the other writers.
- Driver actions used compare-and-set writes but had separate rules and
  responses from the staff route.

`src/controllers/orderAssignment.controller.ts` and
`src/services/autoDispatchPickupPlan.service.ts` change state only while
assigning or unassigning a driver. They now use the same policy while retaining
their existing assignment compare-and-set and Number 4 advisory-lock behavior.

## Authorized transition matrix

| Actor/workflow | Allowed transition | Receipt required |
| --- | --- | --- |
| New order | initial `PLACED` | No |
| Auto-dispatch | `PLACED -> DISPATCHED` | No |
| Manual assignment | `PLACED -> DISPATCHED` | No |
| Manual unassignment | `DISPATCHED -> PLACED` | No |
| Assigned driver action | `PLACED/DISPATCHED -> ACCEPTED` | No |
| Receipt transaction | `ACCEPTED -> OUT_FOR_DELIVERY` | Created or updated atomically |
| Assigned driver action | `ACCEPTED -> OUT_FOR_DELIVERY` | Existing valid receipt |
| Assigned driver action | `OUT_FOR_DELIVERY -> DELIVERED` | Existing valid receipt |
| Authorized staff cancellation | `PLACED/DISPATCHED/ACCEPTED/OUT_FOR_DELIVERY -> CANCELLED` | No |

`DELIVERED` and `CANCELLED` are terminal. All other actor/status combinations
are rejected with `409 INVALID_ORDER_TRANSITION`. Pickup or delivery completion
without a persisted receipt is rejected with `409 RECEIPT_REQUIRED`.

The legacy staff status route is now cancellation-only. The current web
dispatcher uses it only for cancellation, so its current workflow remains
compatible. No unrestricted administrator override was added because no active
backend or dispatcher operation required one.

## Concurrency and side effects

Driver actions retain their `updateMany` compare-and-set on order ID, assigned
driver, and current status. Two requests that read the same prior state can
therefore commit only one transition. Lifecycle timestamps are built from the
central policy and preserve an existing timestamp on retries.

Receipt creation/update and `ACCEPTED -> OUT_FOR_DELIVERY` remain one
transaction under the existing PostgreSQL `FOR UPDATE` order-row lock. An
error rolls back both writes. Customer out-for-delivery notifications are sent
only after a successful status write; delivery loyalty processing runs only for
the single successful `OUT_FOR_DELIVERY -> DELIVERED` compare-and-set winner.

Number 4 auto-dispatch continues to use its transaction-scoped PostgreSQL
advisory lock, and Number 2 route evaluation remains
`driver -> ordered pickup stops -> customer`.

## Client audit

The current Driver Android app saves a receipt from the accepted-order screen;
the button is explicitly labeled "Save Receipt & Mark Picked Up" and uses
`POST /orders/:id/receipt`. That endpoint continues to return the same receipt
response and transition the order atomically, so its workflow is compatible.
The older `driver-action` pickup request remains available only when an
existing receipt is present.

No iOS driver source is present in this workspace. Its compatibility cannot be
verified here. The legacy `speedy_sweeties_android_phase1` dispatcher screen
contains direct ACCEPTED, OUT_FOR_DELIVERY, and DELIVERED status buttons. Those
requests are intentionally rejected by the now cancellation-only staff status
endpoint because the client has no receipt-backed driver workflow. It must be
retired or updated before relying on those legacy dispatcher actions.