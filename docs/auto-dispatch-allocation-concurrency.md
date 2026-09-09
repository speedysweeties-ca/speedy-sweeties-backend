# Auto-Dispatch Allocation Concurrency

## Entry point and previous boundary

`src/controllers/order.controller.ts` calls
`autoDispatchCreatedOrderWithPickupPlan(orderId)` after the order-creation
transaction has committed. The planner reads the order, pickup locations, and
eligible drivers, then calls Google Routes before starting its assignment
transaction.

Before the allocation lock, driver workload counts were also read before that
transaction. The transaction protected only the target order with an
`updateMany` compare-and-set on `id`, `PLACED`, and an unassigned driver. Two
different orders could therefore calculate the same old driver workload and
each commit an assignment to the same driver. The compare-and-set prevented
duplicate assignment of one order, but did not coordinate driver allocation
between orders.

Manual assignment is a separate path in
`src/controllers/orderAssignment.controller.ts` and is unchanged by this work.

## Current allocation protocol

The planner calculates the Number 2 traffic-aware route matrix before opening
the protected transaction. The route remains `driver -> ordered pickup stores
-> customer`; no Google call occurs while an allocation lock is held.

Inside `prisma.$transaction`, the planner runs:

```sql
SELECT pg_advisory_xact_lock(20260909, 4)
```

This fixed PostgreSQL transaction-scoped advisory lock serializes only the
brief auto-dispatch allocation and persistence phase across every Node process
using the same database. PostgreSQL releases it automatically on commit,
rollback, or connection loss. This is database coordination rather than a
process-local JavaScript mutex.

After acquiring the lock, the transaction:

1. Rechecks the auto-dispatch setting.
2. Locks and verifies the target order is still `PLACED` and unassigned.
3. Re-reads active, visible, online drivers and applies the unchanged one-hour
   last-seen and location freshness checks.
4. Accepts only drivers whose coordinates still match the precomputed
   traffic-aware route matrix, avoiding a fabricated route after a location
   change.
5. Recalculates active-order workloads and regenerates Number 2 sequential
   pickup plans using the current allocation time for projected arrivals.
6. Selects lowest workload first, shortest complete route second, and
   name/email/ID ordering as the deterministic final tie-breaker.
7. Reapplies the existing `updateMany` compare-and-set, then deletes and
   creates the selected ordered pickup stops within the same transaction.

Any error rolls back the assignment and stop writes. A transaction failure is
reported as allocation unavailable, leaving the order `PLACED` and unassigned
for retry or manual dispatch.

## Notifications and schema

The order controller sends a driver push only after the planner returns a
committed `dispatched: true` result. A losing or rolled-back allocation returns
`dispatched: false`, so it cannot schedule an extra notification. The
transactional stop writes and existing `(orderId, pickupType)` uniqueness rule
prevent committed duplicate pickup-stop sets.

No Prisma schema change is required: PostgreSQL advisory locks provide the
cross-process allocation mechanism without persisted lock rows.