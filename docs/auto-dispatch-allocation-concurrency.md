# Auto-Dispatch: Closest Online Driver

## Current rule

After a new order commits, `src/controllers/order.controller.ts` calls
`autoDispatchCreatedOrderWithPickupPlan(orderId)`. The legacy function name is
retained for compatibility, but automatic assignment no longer reads item
pickup types, pickup locations, store hours, or pickup-stop
plans.

When Auto Dispatch is enabled, the service:

1. Requires the order to be `PLACED`, unassigned, and stored with verified
   delivery coordinates.
2. Loads active, dispatch-visible drivers who are marked online.
3. Excludes drivers whose heartbeat or GPS is more than one hour old.
4. Requests one traffic-aware Google Routes matrix from every eligible
   driver's current location directly to the customer's delivery address.
5. While `AUTO_DISPATCH_ROB_PRIORITY_ENABLED` is enabled (default), gives the
   verified Rob Driver account first priority below four unfinished assigned
   orders. Counts every assigned non-DELIVERED/non-CANCELLED order, regardless
   of assignment source. At four or more, excludes Rob from automatic allocation
   and selects another eligible driver; no alternative leaves the order unassigned.
   Below four again, priority resumes. Set the environment flag to `false` to
   restore ordinary selection, including Rob without a special cap.
   Otherwise selects the shortest drive time. Distance and stable driver identity are
   used only to break equal-time ties.
6. Rechecks the setting, order, driver presence, and unchanged GPS coordinates
   inside the assignment transaction.
7. Transitions the order from `PLACED` to `DISPATCHED` with
   `dispatchSource = AUTO` and clears any stale assigned pickup stops.

Item catalog classifications—including `UNKNOWN`—cannot prevent assignment.
The driver apps continue to receive the order's item list and existing routing
response shape. Opening the order remains the driver's `DISPATCHED` to
`ACCEPTED` action.

## Concurrency

The transaction locks the target order with `SELECT ... FOR UPDATE` and
then uses an `updateMany` compare-and-set requiring `PLACED` and no assigned
driver. Concurrent attempts for the same order therefore commit one assignment
and schedule one notification.

There is no global advisory lock. When Rob is a candidate, the transaction takes
his existing assignable-driver row lock before counting active orders and holds
it through assignment. This serializes his capacity decisions, including against
manual assignment's shared driver lock. Concurrent automatic requests cannot
both consume the fourth slot. Manual assignment remains unrestricted and can
take Rob above four; subsequent automatic requests exclude him until below four.
Other drivers keep the existing closest-driver behavior without workload caps.

## Deferred behavior

City geofencing and multi-driver territory rules are deferred. They can be
added later without restoring item-based assignment blocking.
