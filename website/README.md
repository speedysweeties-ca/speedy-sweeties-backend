# Speedy Sweeties public website

Standalone migration of the public homepage captured on October 29, 2026.
The business owns this source in its GitHub account. This folder builds to plain
HTML, CSS, JavaScript, images and fonts and can be served by any static host.
It does not change the API, dispatcher, mobile apps or database.

## Build and maintain

- Content and layout: `src/index.html`.
- Current branding and downloaded public assets: `src/assets/`.
- Form, tracking, analytics and navigation: `src/js/`.
- Preview build: `node website/scripts/build.mjs` from the repository root.
- Tests: `cd website`, then `npm ci` and `npm test`.
- Production build, only after the cutover checks below:
  `node website/scripts/build.mjs --production`.

Builds require Node.js, but no dependency installation. The only npm dependencies
are for synthetic DOM tests; none are shipped to customers. The output is
`website/dist/`, deliberately excluded from git. All build paths resolve relative
to the script, so the command also works from inside this folder.

## Preview behavior

Preview is the default. It displays a notice, disables real API requests and
analytics, and includes `noindex` plus a blocking robots.txt. Customers can inspect
the form; submission shows a preview message and sends nothing. No customer
tracking tokens are read from browser storage on previews.

Even a production build stays in preview mode on any hostname other than
`speedysweeties.ca` and `www.speedysweeties.ca`. This avoids accidentally sending
orders from an onrender.com preview. No hostname query parameter overrides this.

## Render preview configuration

Create a NEW static site after the owner identifies the Render workspace:

| Setting | Value |
| --- | --- |
| Suggested name | `speedy-sweeties-website` |
| Repository | `https://github.com/speedysweeties-ca/speedy-sweeties-backend` |
| Branch for review | `website/render-migration-2026-10-29` |
| Build command | `node website/scripts/build.mjs` |
| Publish directory | `website/dist` |
| Environment | `SKIP_INSTALL_DEPS=true` |
| Auto deploy | Off during migration |

Do not repurpose the existing API or dispatcher service. Do not add a database.
The website does not need backend secrets or a paid Webflow plan.

## Preserved features and boundaries

- Existing copy, rates, section anchors, contact links, branded design and images.
- Existing order API payload and address checking, four payment choices,
  mandatory acknowledgements, hours check, and duplicate-retry protection.
- Existing private token tracking and delivered check-in iframe on production
  origins, with token removal from the URL before analytics.
- Existing production-only GA4 property and events.
- Page metadata, canonical URL, structured data and sitemap.
- Public brand assets are now local. Google Fonts and Google Analytics remain
  intentional external services. The API remains at its current Render address.
- Webflow and jQuery runtimes are removed. An accessible native menu replaces
  Webflow's mobile navigation. Native checkboxes and radios remain.
- The inherited privacy text changes only the hosting provider to Render.

## Remaining cutover checks

This branch is ready for a non-ordering preview, not a completed production move.

1. Owner identifies the Render workspace; create and verify the new static site.
2. Review the replacement on desktop and mobile. Record the new service URL and
   deployment commit. Do not place test orders into production dispatch.
3. Resolve the former Webflow Turnstile widget before enabling production:
   its Webflow-managed site key is not portable and has been removed. The API
   already has order rate limiting, duplicate protection and server validation,
   but it currently does not verify Turnstile tokens. This migration does not
   claim equivalent bot protection. A replacement, if used, needs an owner-held
   key and coordinated server verification; never reuse an agency secret.
4. Confirm current API CORS permits the two production domains and delivered
   tracking iframe CSP still permits them. The domain stays the same, but verify
   actual deployed settings rather than assuming the repository equals production.
   Preview origins deliberately do not receive live API access.
5. Account-deletion publishing is a separate in-progress backend/privacy release.
   Do not publish the repository's deletion-page draft or activate that flow as
   part of this migration without its release prerequisites.
6. After review, use a production build and attach both production domains in
   Render. Record all existing Namecheap DNS records before any edits. Change only
   website records to the exact values Render supplies; preserve mail (MX, SPF,
   DKIM and DMARC), verification and unrelated subdomain records.
7. Verify domain ownership and certificates, HTTPS, www/apex behavior, contact
   anchors, address validation, hours, order acknowledgement, tracking and any
   delivered check-in flow. Verify production analytics without exposing form
   values or tracking tokens. A live order test needs operational coordination.
8. Preserve the old DNS values and captured site archive for rollback. If needed,
   restore the previous website records while the old Webflow hosting remains
   active. DNS rollback cannot restore a canceled/offline Webflow plan.

The hosting migration does not resolve the agency's separate invoice dispute.

## Validation recorded October 29, 2026

- Website synthetic tests exercise accepted orders, rejected orders, ambiguous
  responses, duplicate retry prevention, closed hours, email mismatch, preview
  network isolation, tracking-token URL handling and local asset references.
- Desktop and 390px iframe viewport inspected in the browser.
- Repository backend check: 531 passed, 7 environment-gated tests skipped.
- Dispatcher check and Prisma formatting passed; dispatcher bundle-size warning
  remains. No staff workflow or help content changes are included.
- Backend and website npm audits: no advisories. Existing dispatcher audit reports
  two advisories; see PR validation notes. No dispatcher dependency was changed.
- No production order, live database command, domain change or API deploy was made.
