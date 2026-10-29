# Website verification and approved origins

Prepared October 29, 2026. Verification code is prepared, not activated. The
configuration-only changes recorded below are already live. No database migration
or dispatcher deployment is needed.

## Configuration changes already completed

- API CORS now contains exactly `https://speedy-dispatcher.onrender.com` and
  `https://www.speedysweeties.ca`. The previous value also contained
  `https://speedy-sweeties.webflow.io`. No secret or other environment key changed.
- Render triggered deployment `dep-dbhqrqqfngtc73cbvli0` of the existing healthy
  API commit `3a6cab9be07dba23af8e556f8c807f91d6a018aa` for this config update.
- The website service's Render Subdomain setting is Disabled. HTTPS checks returned
  www 200, apex 301 to www, and the onrender website address 404. API health is 200.
- Website and dispatcher preflights return 204 with their origin allowed. Old
  Webflow and apex requests are denied with no allow-origin header. The existing
  API returns 500 for denied CORS; this proposed code changes that to a controlled 403.
- The owner-held Cloudflare widget and secret still need setup. No verification
  flag was enabled, no website code was deployed and no live order was submitted.

## Local validation

Backend `npm ci`, `npm run check`: 537 passed, seven environment-gated skips;
Prisma formatting and dispatcher-help review passed. Dispatcher install/check:
69 tests passed, build/lint passed with the existing bundle-size warning.
Website: 14 tests passed. Backend audit: zero advisories. Dispatcher audit retains
two existing development-dependency advisories (`zod` high and
`postcss-selector-parser` moderate); no dependencies changed in this release.
Automated tests use synthetic providers and do not prove real Cloudflare activation.

## Owner-controlled configuration

- Create a Cloudflare Turnstile **Managed** widget owned by Speedy Sweeties. Restrict
  its hostname to `www.speedysweeties.ca`; use no pre-clearance. The visible widget
  can verify automatically or ask for a checkbox. No Webflow key is reused.
- Website Render service `srv-dbhpmv2jnfac73ak6ip0`: add the public
  `TURNSTILE_SITE_KEY`. Production builds reject missing/test/former Webflow keys.
- API Render service `srv-d7ntlnpkh4rs73bev9q0`: store `TURNSTILE_SECRET_KEY`
  privately. Never put it in the website, GitHub, PR, logs or chat.
- API `CORS_ORIGIN`: preserve dispatcher and other legitimate app origins, retain
  `https://www.speedysweeties.ca`, and remove the old Webflow staging origin.
  Do not add apex or the Render website preview. The code also denies those three
  origins even if stale configuration still includes them.
- `WEBSITE_TURNSTILE_REQUIRED=false` initially; set true only after the new website
  is live with the owner-held key. The API verifies any supplied token even during
  this staged rollout. Enabled enforcement fails startup without a secret and
  production rejects known provider test secrets.

## Behavior and limits

The website sends `turnstileToken` after address and hours checks. The backend
validates it with Cloudflare before duplicate checks, database writes or dispatch.
It requires success, the canonical hostname, `website_order` action and a fresh
challenge. Tokens expire after five minutes and the provider rejects reuse.
Missing/failed checks return 400; provider/configuration outages return 503. Both
are known pre-creation failures and the website refreshes verification for retry.
Ambiguous order responses still block duplicate retries and retain entered details.
Preview mode loads neither the verification provider nor the live ordering API.

Website verification also applies when a website request claims a mobile source.
Native clients keep their existing flow. CORS and caller-supplied source/origin are
not authentication: this does not protect the entire public API against clients
that impersonate native apps. Mobile attestation/authentication is separate work.
Rate limiting and duplicate protection continue to apply.

Only the canonical www site may embed customer check-in. Standalone tracking on
the API remains available. `WEBFLOW` remains the historical database source label
for website orders; it does not create a dependency on Webflow hosting.

`speedysweeties.ca` is the public apex domain and must keep redirecting to www.
It is not a staging hostname. The onrender website URL has now been disabled;
it is not a private preview environment. Future previews need explicit access
protection. No DNS, email or nameserver change was needed.

## Coordinated release

1. Follow `docs/release-checklist.md`: explicit merge approval and green checks on
   the exact release commit. Confirm no unrelated migration or release changes.
2. Configure the owner-held widget, public key and server-only secret.
3. Deploy the API with enforcement false; preserve native app and dispatcher paths.
4. Deploy the website with the real key. Verify the visible widget completes on
   www and privacy copy is present; do not submit a real customer/order as a test.
5. Enable `WEBSITE_TURNSTILE_REQUIRED=true`, deploy/restart and verify health.
   A synthetic rejected submission can test the guard only when operationally
   authorized. Verify valid server checks in isolation; coordinate any real order.
6. Recheck www/apex HTTPS redirects, approved/denied preflights, tracking CSP,
   business hours, address suggestions and dispatcher health. Watch errors without
   logging tokens, secrets, customer fields or tracking credentials.

Prior healthy API commit: `3a6cab9be07dba23af8e556f8c807f91d6a018aa`.
Prior healthy website commit: `306548c99677e8288e6ef38bc23b78b86500234a`.
If rolling back the website, coordinate enforcement: old cached pages have no
token and will be rejected once enforcement is enabled. Prefer correcting the
configuration; disabling enforcement temporarily reduces bot protection and needs
owner approval. Do not silently weaken it or restore Webflow permissions.

## Help review

Reviewed guide `order-lifecycle`: staff statuses, receipts, timers and actions do
not change. Example questions: “What happens after an online order is placed?” and
“Why does Live Orders show a late-order warning?” The guide's review date/evidence
are updated; no staff button or policy has been invented.
