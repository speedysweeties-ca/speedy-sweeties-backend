# Authoritative delivery locations

Order creation and civic-address edits are normalized and geocoded by the backend.
Clients continue sending the existing structured `addressLine1`, `city`, `province`,
and `postalCode` fields. No client-provided coordinates are accepted.

Authenticated dispatcher order responses and assigned-driver order responses now
include these optional fields:

- `deliveryLatitude`
- `deliveryLongitude`
- `geocodeStatus` (`VERIFIED`, `NEEDS_REVIEW`, or `UNVERIFIED`)
- `geocodedAddress`
- `geocodePlaceId`
- `geocodeAddressFingerprint`

Public tracking responses do not expose this internal geocoding metadata. Existing
clients may ignore all new fields.

Invalid or contradictory addresses return HTTP 400 with code
`INVALID_DELIVERY_ADDRESS` or `POSTAL_CODE_MISMATCH`. If the provider is unavailable,
order creation continues with `NEEDS_REVIEW` and null delivery coordinates.

Set the server-only `GOOGLE_GEOCODING_API_KEY` and enable Google Geocoding API.
There is currently no delivery distance-radius restriction. Verification still
requires a Canadian, Ontario civic address consistent with the submitted
municipality and postal code.

The one-time backfill command is dry-run by default:

```text
npm run backfill:delivery-locations -- --limit=500
```

Add `--apply` only in a controlled environment after reviewing the dry-run. The
script does not log customer addresses and skips verified coordinates whose
fingerprint still matches the current civic address.
