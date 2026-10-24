# Webflow order form

## Current live integration

`site-footer.html` is the complete site-level footer captured from Webflow on
2026-10-04, with the Sweetie Check-In integration added to the existing tracker.
It preserves the newer order form, hours gate, ambiguous-submission protection,
analytics, and private saved-order tracking that were previously maintained in
Webflow directly. Follow `docs/sweetie-check-in.md` for the backend-first release
sequence and reconcile any later Webflow edits before publishing.

The older `order-form.js` below is a historical reference; do not replace the
current live site footer with that file.

## Browser autofill

The live footer loads `public/webflow/address-autocomplete.js` from the API host.
That script also enables browser autofill for the name, phone, email, street,
unit, and city fields and adds a short tip above the form. It does not read the
device's contacts or save a new customer profile. The browser decides whether to
offer saved details; email confirmation and buzz code remain separate.

Saved or typed addresses use the existing strict `/addresses/verify` check at
submission, without requiring a Google suggestion click first. Invalid addresses,
provider failures, and edits during verification still block submission. Google
suggestions remain available for customers typing an address.

Deploy this public script through the existing API service. The live script URL
stays the same, so no Webflow footer replacement or full-site publish is needed.
The asset's existing cache lifetime is five minutes. Verify the live form after
deployment; actual saved-profile suggestions also depend on each device's settings.

## Historical order-form reference

`order-form.js` is the older page-level custom code retained for reference.
The current complete implementation is in `site-footer.html`.

It keeps the required street address separate from the optional apartment/unit
number and buzz code. The optional values are sent to the API as `unitNumber`
and `buzzCode`; they are never appended to `addressLine1`, so geocoding and
Google Maps continue to receive only the civic street address.

## Publish sequence

1. Deploy the backend migration and API support first.
2. In Webflow, replace the existing order-form script in the page-level code
   before `</body>` with the complete contents of `order-form.js`.
3. Publish both the Webflow staging domain and `www.speedysweeties.ca`.
4. Verify the form shows these fields immediately after Street Address:
   - Apartment / Unit Number (Optional)
   - Buzz Code (Optional)
5. Submit a controlled test order and confirm the dispatcher and Driver v1.6
   show both values while map navigation uses only the street address.

The second analytics script on the page is separate and should remain in place.

## Account-deletion page — review artifact, not published

`account-deletion-page.html` is accessible, customer-facing copy for a stable
`/account-deletion` website path. It is deliberately a review artifact: publishing
it requires Robert's separate approval and must follow a functioning reviewed
backend flow and monitored support mailbox. The page uses the existing support
email as an initiation path for customers without the app; it does not call the
privacy API, collect secrets, or treat emailed order facts as proof of ownership.

The proposed production URL is
`https://www.speedysweeties.ca/account-deletion`. On 2026-10-24, connected
read-only Webflow access identified the Speedy Sweeties site and a page inventory
containing only Home; both this path and proposed
`https://www.speedysweeties.ca/privacy-policy` returned HTTP 404. Connected site
access exists and exposes page/publish operations, but write
permission was not exercised and the pages have not been created. The exact policy
candidate is maintained in the iOS release branch at
`ReleaseNotes/PRIVACY_POLICY_PROPOSED.txt`; do not publish either page until all
editor markers are resolved and the described production behavior is deployed and
verified.

When it is authorized for publication, place the content in a Webflow page whose
public URL remains stable, set the final privacy-policy link, publish staging first,
and verify keyboard navigation, the email link, mobile layout, HTTPS, and the live
URL while signed out. Only then enter that verified URL in Google Play Console.
