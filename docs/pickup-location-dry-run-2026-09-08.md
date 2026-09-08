# Pickup Location Dry-Run Reconciliation — 2026-09-08

## Purpose

Perform a no-write production reconciliation before importing the prepared Guelph Pickup Location dataset.

## Production state

Read-only inspection of the live Render PostgreSQL database found exactly one current PickupLocation row:

- Name: Quickie - Willow Road
- Pickup Type: CONVENIENCE
- Address: 61 Willow Rd, Guelph, ON N1H 1W3
- Active: true
- Latitude: 43.54426
- Longitude: -80.273257

The live ItemCatalog contains zero unsupported or legacy Pickup Type values.

## Prepared seed dataset

The reviewed seed package now contains 57 Guelph pickup locations:

- 5 LCBO
- 4 The Beer Store
- 23 cannabis dispensaries
- 7 vape shops
- 18 strategic convenience locations

The existing production Willow Road Quickie is included in the prepared dataset so the future importer can reconcile that row rather than create a duplicate.

## Expected database actions before Google geocoder verification

- Existing matches: 1
- New candidates: 56
- Unsupported Pickup Types: 0
- Production writes performed during this reconciliation: 0

The existing Willow Road Quickie may be reported as UPDATE rather than UNCHANGED by the final importer if Google's canonical formatting/coordinates differ from the currently stored row. It must not be treated as a second store.

## Cross-category collision review

Several same-building addresses were reviewed because proximity alone must never be treated as duplication.

- J. Supply Co. and Royal Vapes are both currently listed at 1515 Gordon Street Unit 106. Current business information describes Royal Vapes as an adjoined vape shop alongside J. Supply Co. This is a legitimate cross-category co-location.
- Farah Market Express and 6ix Vape are both currently listed at 484 Woodlawn Road East. Current official store pages confirm both businesses at that address. This is a legitimate cross-category co-location.
- Nearby businesses sharing a plaza/building remain separate PickupLocation records when their business identity or pickup type differs.

## Safety boundary

This reconciliation used read-only production database access and current public business verification. No PickupLocation rows were created, updated, deactivated, or deleted. Auto-dispatch and driver assignment behavior were not changed.

## Remaining operational step

The actual backend Google-geocoder dry-run still needs to execute in the real speedy-api runtime before apply mode. The connected Render controls available to ChatGPT do not expose an arbitrary service shell or existing secret environment variable values, so the seed command cannot currently be invoked inside the running service without first deploying a controlled runner.
