# Pickup Route Selection

## Original algorithm (before sequential routing)

The auto-dispatch pickup planner read the order's distinct, non-`UNKNOWN`
pickup types, fetched active operational locations for those types, and fetched
eligible drivers with valid coordinates. It requested a Google Routes
traffic-aware matrix only for `driver -> store` pairs.

For each driver, `selectPickupStoreRecommendations` processed every required
pickup type independently. It discarded locations without a route, projected
arrival as `routing generated time + driver -> store duration`, and applied
the pickup-location operational status, manual closure, current hours, regular
hours, and three-minute closing-buffer checks. It then selected the shortest
individual `driver -> store` route for each type.

The resulting stores were sorted again by those independent driver-to-store
durations before persistence. No route was calculated from one selected store
to the next, and no route from the final selected store to the customer was
included. Consequently, stop sequence, projected arrival, and route choice
could not represent the complete pickup journey.

Auto-dispatch evaluated drivers in active-order-count/name order and accepted
the first driver with a complete independently selected plan. A Google Routes
failure held the order. `UNKNOWN` items or no recognized pickup types held the
order for dispatcher review.

The routing-preview endpoint separately calculated `driver -> customer`
durations for its displayed driver ETA and separately calculated
`driver -> store` pickup recommendations. Its pickup recommendations therefore
had the same independent-store selection behavior and did not affect the
displayed delivery duration.

## Existing consumers

- `src/services/autoDispatchPickupPlan.service.ts` selects and persists
  auto-dispatch pickup stops.
- `src/controllers/routingPreview.controller.ts` exposes dispatcher pickup
  recommendations and driver route duration/ETA.
- `src/controllers/order.controller.ts` invokes auto-dispatch after order
  creation.
- `src/controllers/driverOrders.controller.ts` returns persisted pickup stops
  in sequence order to the driver app.

`src/services/pickupLocationHours.service.ts` maintains the hours data used by
the route eligibility check; it does not select routes. The pickup-location
availability utility filters inactive and non-operational locations before
routing.

## Sequential algorithm

For orders with pickup requirements, both auto-dispatch and dispatcher preview
now request one traffic-aware directed matrix containing every required leg:
each driver to every candidate store, every candidate store to every candidate
store, and every candidate store to the customer destination. Destination
coordinates must be verified for auto-dispatch to create a complete plan.

For each driver, the route scorer groups stores by required pickup type and
keeps at most two candidates for each routing priority within that type. The
Preferred and Standard phase therefore considers at most four candidates per
type; Preferred capacity cannot be consumed by Standard stores. Candidates are
shortlisted by traffic-aware `driver -> store -> customer` usefulness (then
store name and ID), rather than by driver distance alone. This means a
Preferred location outside the four closest driver-to-store legs remains
eligible when its complete journey is competitive.

The scorer streams complete routes instead of retaining them. It makes one
pass for the fastest baseline and one pass for the Preferred winner. With at
most four pickup types, the primary phase evaluates at most
`2 * 4! * 4^4 = 12,288` completed routes. Fallback candidates receive their
own two-slot capacity and are evaluated only when no complete Preferred/Standard
route exists; that fallback phase adds at most `2 * 4! * 6^4 = 62,208` routes.
The combined maximum is 74,496 completed-route evaluations per driver and the
planner retains at most a baseline and a Preferred winner at once.

The scorer explores every retained combination and visit order. Each next leg
starts at the previously selected store. At each projected arrival it applies
the existing operational-status, manual override, current-hours, regular-hours,
and three-minute closing-buffer rules. It rejects a route immediately if its
next stop cannot be reached safely. A completed candidate must also have a
route from its final pickup store to the customer.

Among valid complete journeys, the scorer first uses the fastest total driving
duration as its baseline. A Preferred route may win only when it is within 180
seconds of that baseline; among qualifying routes, it chooses more Preferred
locations, then shorter complete duration, then the pickup-type/store-ID
sequence as a deterministic tie-breaker. If no Preferred route qualifies, it
uses the fastest complete route. Auto-dispatch compares the selected complete journey for every
eligible driver and chooses the lowest total duration; existing workload/name
ordering provides its deterministic equal-duration tie-breaker.

The selected pickup stops remain in travel sequence for persistence. Each stop
stores its cumulative driver departure-to-stop ETA, projected arrival time, and
the hours/closing-buffer result evaluated at that sequential arrival. Dispatcher
preview exposes the same complete-route duration and ETA for pickup orders.
