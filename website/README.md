# Speedy Sweeties public website

Standalone migration of the public homepage captured on October 29, 2026.
The business owns this source in its GitHub account. This folder builds to plain
HTML, CSS, JavaScript, images and fonts and can be served by any static host.
It does not change the API, dispatcher, mobile apps or database.

## Build and maintain

- Content and layout: `src/index.html`.
- Current branding and downloaded public assets: `src/assets/`.
- Form, tracking, analytics and navigation: `src/js/`.
- Service landing-page copy: `content/services.mjs`; page template:
  `scripts/render-service-pages.mjs`; styles: `src/assets/service-pages.css`.
- Privacy statement: keep the published text in `src/index.html`. The build renders
  its standalone layout with `scripts/render-privacy-page.mjs`; styles are in
  `src/assets/privacy-page.css`. Both public copies use that same source.
- Preview build: `node website/scripts/build.mjs` from the repository root.
- Tests: `cd website`, then `npm ci` and `npm test`.
- Production build, only after the cutover checks below:
  `node website/scripts/build.mjs --production`.

Builds require Node.js, but no dependency installation. The only npm dependencies
are for synthetic DOM tests; none are shipped to customers. The output is
`website/dist/`, deliberately excluded from git. All build paths resolve relative
to the script, so the command also works from inside this folder.

## Service landing pages

The build generates three separate pages from `content/services.mjs`:

| Page | Path |
| --- | --- |
| Beer | `/beer-delivery-guelph/` |
| Alcohol | `/alcohol-delivery-guelph/` |
| Convenience | `/convenience-delivery-guelph/` |

Each page has unique copy, title, description, canonical/social metadata,
WebPage/breadcrumb structured data, a shared 19+ self-declaration and navigation
back to the main website. The homepage service section and sitemap link all three.
Ordering remains on the existing homepage; landing pages do not submit orders.
The acknowledgement stores only `19-plus` in sessionStorage for the current tab
session. It is not verified age or identity and does not replace delivery checks.

Production landing-page analytics use the existing GA4 loader and add
`landing_age_confirmation` plus `service_landing_click` with the fixed service
category and destination type. Neither event is an accepted-order conversion.
Previews remain noindex, make no order requests and emit no analytics.

On November 11, 2026, the owner authorized the website changes requested in
Google Ads support case 7-9441000042376. Prescription-pickup offers were removed
from the homepage. The vape and cannabis information pages are retired: the
build no longer generates their service content, navigation or sitemap entries.
Initial live checks still returned cached old content at slash URLs after source
removal. The build therefore explicitly overwrites both old resources with a
generic retirement notice containing no service offers, scripts or forms and
`noindex, nofollow`. These are static notices, not a claim of HTTP 404/410 status. This is the same public content
for users and crawlers; no user-agent-specific treatment is introduced.
Alcohol age/ID safeguards and privacy disclosures remain in place. A privacy
statement about sensitive order data is not a prescription-service offer and
must not be removed merely to change ad classification. Historical attribution
codes are retained for records from previously published pages.
Google reports that alcohol Approved (limited) is expected and the destination
accessibility label is stale. Publication does not itself establish Google Ads
re-approval; a separate platform re-review is still needed.

Release scope is website-only. It requires no API, dispatcher, mobile, database,
environment-variable or DNS change. Use the existing website production build
and owner-held Turnstile site key. Follow the repository's explicit merge approval
and current-head CI requirements before publishing. Current live website source
before this change: `7b564b6b99495948c9aff007f37bfda81e0b49ed`; rollback means a
website-only redeploy of that prior healthy source. Backend/privacy releases
remain separate. Dispatcher guide IDs: not applicable; no staff workflow changes.

## Dedicated privacy page and compatibility

The build also generates `/privacy-policy/`, the canonical standalone privacy
page, and `/privacy/`, a noindex compatibility copy. The original homepage
`/#privacy-policy` section and full published text remain available. Its heading
and all three service-page footers link to the dedicated page. The sitemap contains
six canonical URLs; the compatibility copy is omitted. The static host resolves
the slashless privacy paths to their directory pages; verify that behavior live.

Legal pages are readable without JavaScript, an age acknowledgement, login or
human-verification challenge. They include no form, order API client or Analytics
loader. Preview metadata remains noindex, and the shared runtime config preserves
the canonical-host guard. Policy content and effective/updated dates are retained;
this publication does not activate an app-deletion flow or publish its draft copy.

App/store link checks and the remaining separate privacy-release work are recorded
in [website-privacy-page-rollout.md](../docs/website-privacy-page-rollout.md). No
Android/iOS build or store metadata is changed by this website release.

## Preview isolation

Preview is the default. It displays a notice, disables real API requests and
analytics, and includes `noindex` plus a blocking robots.txt. Customers can inspect
the form; submission shows a preview message and sends nothing. No customer
tracking tokens are read from browser storage on previews.

Even a production build stays in preview mode on any hostname other than
`www.speedysweeties.ca`. This avoids accidentally sending
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

## Original migration checklist (historical)

The website migration was completed on October 29, 2026. The checklist below
records the original cutover considerations. The separate verification release
is described in [website-verification-rollout.md](../docs/website-verification-rollout.md).
Production builds now require the owner-held public `TURNSTILE_SITE_KEY`; the
server secret belongs only on the API service. The apex redirects to www and
does not receive direct browser API permission. A non-ordering preview is public
unless separately restricted by the host.

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

## Public page counters

The homepage, five service pages and driver application show separate aggregate
page-load totals. Repeat loads count; these are not unique people or historical
GA4 totals. Previews never call the counter API. No visitor identifier, cookie,
IP address or referrer is stored in the counter table. Failed requests show an
unavailable label and are never retried automatically. Public counters are
approximate: blockers, bots and rate limiting can affect totals.

Deploy the backend with the additive PageViewCounter migration before deploying
the website. Both use existing services; no new provider, secret or paid service
is needed. Preserve the current production build flags and Turnstile key.
Totals survive deployments/restarts. Roll back code without dropping the table.


### Website order traffic sources (November 11, 2026)

`order-attribution.js` retains a coarse entry source/medium and landing-page category
for at most 30 minutes in a tab. A recognized external arrival, allowlisted UTM pair
or advertising click-tag presence establishes a new entry; internal navigation
preserves the existing entry without extending its expiry. Storage failure leaves
in-memory attribution available only on the current page. Missing sources stay
untagged; `utmContent` contains a fixed `web_v1` entry/method marker. It is never a
customer identifier. No full URL, arbitrary campaign/term/content text, click ID
or GA4 identifier is sent in these fields. These are best-effort observations,
not verified GA4 attribution, unique customers or evidence of causation.

The existing order POST accepts these optional fields; there is no new endpoint,
database migration, subscription or extra analytics request. Legacy `WEBFLOW`
continues to identify the website order surface, despite Render hosting it.
Existing orders are not backfilled. Growth > campaign rows separate Orders from
Completed (DELIVERED). Help guide `growth` explains how to interpret the fields.
The source-label data becomes useful only as future genuine orders arrive.

Rollout: publish the website and the backend help update after current-head CI.
Set website-only `PUBLIC_PRIVACY_POLICY_DATE=2026-11-11` (merge with existing env,
never replace all variables). It supersedes the old date in Render's saved build
command; publication approval and exact-content/date validation still apply.
All three public privacy copies share the new disclosure. Auto-Deploy remains off.
No dispatcher bundle, mobile app, database, API environment or DNS change is needed.

Rollback targets: website `4e1956a3a49c94e270778ee66daac37b28e49e71`, API
`f21813ff38c1bf936d59ad84bea2a8e80ab3a1ad`. The old website build ignores the new
date variable and uses its original November 7 command. Retained source tags on
existing orders need no reversal. Validation must not place real test orders or
label a successful browser acknowledgement as a completed delivery.

### Neutral privacy wording — November 12, 2026

Robert authorized the wording update and policy re-review requested in Google Ads
support case 7-9441000042376. The shared policy now says: "An order request may
itself reveal sensitive personal information." It retains the sensitive-data
warning without a named service example. No other disclosure or ordering behavior
changes. Homepage, canonical privacy page and compatibility privacy page use the
same source. Publication is not Google Ads re-approval.

For this website-only release, merge `PUBLIC_PRIVACY_POLICY_DATE=2026-11-12` into
the existing website service configuration, never replace its variable collection.
Keep the current production flags, owner-held Turnstile key and Auto-Deploy Off.
The renderer pins this exact policy hash/date for later unchanged rebuilds and
preserves historical hashes for rollback. Current-head checks and the owner's
explicit implementation authorization apply before merge/publication.

Prior healthy website/rollback source: `440df36c6bea67478bcb2bb35f3d0bf54e460627`.
Restoring that source requires restoring its policy date `2026-11-11` as well.
No API, dispatcher, app, database, DNS, provider or budget change belongs to this
release. Dispatcher help guide IDs: not applicable.
