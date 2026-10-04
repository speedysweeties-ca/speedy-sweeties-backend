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
