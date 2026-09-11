# Auto-Dispatch: Closest Online Driver

## Current rule

After a new order commits, `src/controllers/order.controller.ts` calls
`autoDispatchCreatedOrderWithPickupPlan(orderId)`. The legacy function name is
retained for compatibility, but automatic assignment no longer reads item
pickup types, pickup locations, store hours, driver workloads, or pickup-stop
plans.

When Auto Dispatch is enabled, the service:

1. Requires the order to be `PLACED`, unassigned, and stored with verified
   delivery coordinates.
2. Loads active, dispatch-visible drivers who are marked online.
3. Excludes drivers whose heartbeat or GPS is more than one hour old.
4. Requests one traffic-aware Google Routes matrix from every eligible
   driver's current location directly to the customer's delivery address.
5. Selects the shortest drive time. Distance and stable driver identity are
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

The transaction locks only the target order with `SELECT ... FOR UPDATE` and
then uses an `updateMany` compare-and-set requiring `PLACED` and no assigned
driver. Concurrent attempts for the same order therefore commit one assignment
and schedule one notification.

There is intentionally no global advisory lock. Different orders may be
assigned concurrently to the same closest driver because workload balancing is
not part of the current rule.

## Deferred behavior

City geofencing and multi-driver territory rules are deferred. They can be
added later without restoring item-based assignment blocking.
