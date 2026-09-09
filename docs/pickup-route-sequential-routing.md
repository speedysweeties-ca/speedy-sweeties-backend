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
keeps at most four reachable candidates per type. The retained candidates are
ranked by traffic-aware driver-to-store duration, then store name and ID. It
supports at most four distinct pickup types. This bounds normal exhaustive
search to $4^4 * 4! = 6,144$ complete store-combination and stop-order routes
per driver.

The scorer explores every retained combination and visit order. Each next leg
starts at the previously selected store. At each projected arrival it applies
the existing operational-status, manual override, current-hours, regular-hours,
and three-minute closing-buffer rules. It rejects a route immediately if its
next stop cannot be reached safely. A completed candidate must also have a
route from its final pickup store to the customer.

Among valid complete journeys, the scorer chooses the shortest total driving
duration. Equal totals use the pickup-type/store-ID sequence as a deterministic
tie-breaker. Auto-dispatch compares the selected complete journey for every
eligible driver and chooses the lowest total duration; existing workload/name
ordering provides its deterministic equal-duration tie-breaker.

The selected pickup stops remain in travel sequence for persistence. Each stop
stores its cumulative driver departure-to-stop ETA, projected arrival time, and
the hours/closing-buffer result evaluated at that sequential arrival. Dispatcher
preview exposes the same complete-route duration and ETA for pickup orders.