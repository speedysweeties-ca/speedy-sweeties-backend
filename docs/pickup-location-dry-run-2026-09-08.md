# Pickup Location Production Reconciliation — 2026-09-09

## Outcome

The prepared Guelph pickup-location dataset has been imported and reconciled in production. The former dry-run/import step documented here is complete.

Read-only production checks found 57 pickup locations: 56 active and one inactive. All 57 have coordinates and Google Place IDs. No duplicate normalized name/type, address/type, or coordinate/type combinations were found.

| Pickup type | Active | Total |
| --- | ---: | ---: |
| Beer Store | 4 | 4 |
| Convenience | 17 | 18 |
| Dispensary | 23 | 23 |
| LCBO | 5 | 5 |
| Vape | 7 | 7 |
| **Total** | **56** | **57** |

The live ItemCatalog contains only the six supported catalog values: the five routable store categories above plus `UNKNOWN` for items that still require classification.

## Data-quality findings

Two status differences require explicit operational treatment rather than automatic database changes:

- Canja — Surrey Street East is active locally but Google reports `CLOSED_PERMANENTLY`. It must not appear in route matrices, routing recommendations, or driver fallback candidates.
- Gordon Convenience — Gordon Street is inactive locally while Google reports `OPERATIONAL`. The inactive state is treated as an intentional business decision unless an operator confirms that it should be reactivated.

Five locations do not have an optional postal code:

- Farah Market Express — Starwood Drive
- Hasty Market — Kortright Road West
- J. Supply Co. — Gordon Street
- The Green Room Cannabis — Wyndham Street North
- True North Cannabis Co. — Wellington Street West

This is low severity because routing uses verified coordinates. Pickup-location create/update flows now preserve postal codes so operators can complete these records later.

## Routing safeguards

Pickup-location management accepts only the five routable store categories. Active locations with a Google status other than `OPERATIONAL` are excluded before route-matrix calculation and from driver fallback candidates. Locations that have not yet received a Google business status remain eligible for the existing hours checks, which fail closed if trustworthy hours are unavailable.

The existing pickup-stop rules remain in place:

- one selected stop per required pickup type;
- stores must be open at the projected arrival time;
- a three-minute closing buffer is mandatory;
- manual dated hours override current/holiday hours, which override regular hours;
- unknown item pickup types hold the order for dispatcher review;
- auto-dispatch writes ordered pickup stops in the same transaction as assignment.

## Production verification boundary

No production pickup-location rows were created, updated, activated, deactivated, or deleted during this reconciliation. Production currently has no `OrderPickupStop` records, so the remaining operational proof is one controlled end-to-end field order after this hardening change is released. That field test should confirm that the dispatcher preview, automatic assignment, and driver pickup-stop sequence agree.
