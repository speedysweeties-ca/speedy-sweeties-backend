# Master-list website work — November 12, 2026

Implementation owner: ChatGPT in Robert's master-list execution session.
Branch: `website/master-order-help-2026-11-12`; base: `c7b2e0529cbcf9df8b8ef0f3744240c6346ea220`.
VS Code should choose other IDs; do not implement WEB-04 or GRO-16 concurrently.
This repository note is the ownership handoff; it is not evidence that another
session has read it.

| ID | Original priority / decision | Current scope and acceptance | Status |
| --- | --- | --- | --- |
| WEB-04 | 1 / Keep for later | Verify GA4 events; repair current order CTA measurement without customer values | Reviewable candidate; not deployed |
| GRO-16 | 1 / Keep for later | Same-page unfinished-order help; preserve validation, closure and duplicate protection | Reviewable candidate; not deployed |

Robert answered the two scope/ownership questions in this session on November 11
Toronto time (host date November 12):

- Q-GRO-16-001: **Website help (Recommended)** — “Help visitors resume an unfinished order; no email or text outreach.”
- Q-GRO-16-OWNER-001: **ChatGPT here (Recommended)** — “I prepare and test the website change here; give VS Code other project IDs.”

The help stays within the current page. It does not save customer drafts, send
messages, add a provider, create API traffic, or change submission rules. It is
not cross-session abandoned-cart recovery. Successful submission remains a
backend acknowledgement, not a CTA click. Only accepted orders emit the existing
`order_request_submit` event. All GA4 click events contain event names only.

Preserve the November 11 Google Ads changes: only beer, alcohol and convenience
service pages are active. Vape/cannabis retirement notices must remain retired.
This supersedes the old five-page assumption, not the master list's history.

Website-only candidate; no dispatcher guide IDs or staff workflow changes.
No API/mobile/schema/environment/DNS dependency. No new paid service or allowance.
Release requires explicit exact-revision approval and passing current-head CI
under `docs/release-checklist.md`; no merge or deployment is claimed here.

## Validation and next step

Implemented the inline helper and stable `data-order-start` markers on four CTAs.
Typing/checking a form field enables same-page help while confirmed open; focus
alone does not. The existing CTAs then say “Continue my order.” The helper button
focuses the first invalid field, or submission/verification when fields are valid.
Reset, closure, submission, success and uncertain receipt suppress the helper.
There is no new draft storage, timer, marketing event, API request or outbound
message. Previews do not show recovery help or accept orders.

Validation on Node 24.22.1:

- Website: all **55 tests pass**, preview build passes; npm audit: **0 advisories**.
- Backend `npm run check`: **616 pass, 14 intentionally skipped, 0 fail**. Used
  `NODE_ENV=test`, synthetic local-only database/JWT values, stub Firebase and
  auto-dispatch off. No production credentials/database were used. An initial
  unconfigured attempt failed for missing JWT configuration; the configured run
  above supersedes it. Skipped database exercises remain GitHub CI's responsibility.
- Dispatcher `npm run check`: lint passes with 7 existing warnings; **71 tests
  pass**, production build passes with the existing >500 kB chunk warning.
- `npx prisma format --check` and dispatcher-help check against the base pass;
  no dispatcher implementation files or guide IDs changed. Example dispatcher
  questions: not applicable (website-only customer interaction).
- Root npm audit: 4 moderate + 1 low transitive advisories, no high/critical;
  dispatcher audit: 7 moderate development-tool advisories, no high/critical.
  Locks/dependencies are unchanged. Root: fast-xml-parser, glob, google-gax,
  minimatch, rimraf. Dispatcher: minimatch and TypeScript ESLint dependents.
  Track remediation separately; no unrelated dependency update included.
- `git diff --check` passes. Headless visual inspection could not launch because
  this environment denied Chromium's process-singleton socket. No visual/device
  pass is claimed. The DOM tests verify focus targeting and existing form gates.

Next: open a draft PR, inspect current-head GitHub checks (including guarded
database checks), review desktop/mobile appearance, then ask for exact-revision
merge/website-only deployment approval. Before release re-read the website's
current Render build command, preserve its owner-held Turnstile key and published
privacy-policy flags/date, and identify the actual prior healthy website deploy.
The source base above is not an independently verified live rollback target.
After release verify the CTAs/helper on the live website without placing an order;
confirm a future real accepted order still records its success event. This change
does not claim improved order completion or a measured abandonment rate.

Physical Android v6 checks remain separate, scheduled for November 12 at 9:35 a.m.
Toronto. GRO-17 still requires a separate decision about slow-night promotion
scope and sending; do not infer a discount or launch a campaign.
