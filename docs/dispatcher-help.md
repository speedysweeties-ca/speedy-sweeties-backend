# Dispatcher help guide

The **How do I…?** tab answers staff workflow questions, supports follow-ups,
and displays expandable source guides with links to the relevant dispatcher tab.
It is available through `POST /api/v1/dispatcher-help/ask` to active ADMIN and
DISPATCHER accounts, using the existing authentication and server-side OpenAI key.
It cannot read customer/order records or perform changes.

## Configuration and rollout

- Reuses `OPENAI_API_KEY` already used by Talk to Sweetie. Never put this key in
  a Vite variable or the browser. No new key or database migration is required.
- Optional `OPENAI_DISPATCHER_HELP_MODEL` defaults to `OPENAI_ORDER_DRAFT_MODEL`,
  then `gpt-5.6-luna`. Uses the existing Responses API integration pattern.
- Optional `OPENAI_DISPATCHER_HELP_TIMEOUT_MS` defaults to 20,000 (clamped to
  1,000–30,000). Missing key returns a configuration message without an API call.
- Deploy backend before dispatcher. Follow `docs/release-checklist.md`.
- Validate with a real staff session: saved address question, existing-order
  follow-up, unsupported refund policy, source navigation, and sign-out.
  Mocked tests do not establish live model quality or production key validity.

## Maintaining the knowledge

`src/data/dispatcherHelpKnowledge.ts` is the versioned source of truth. Each
article has a stable ID, title, reviewed date, permitted roles, destination,
plain-language content and code/document evidence for maintainers. The full
workflow audit was refreshed on 2026-10-26 against main commit `7bcaaf7` and the
integrated PR 93 review head. The guide now contains 38 articles covering all 20
dispatcher destinations, shared settings and alerts, and separate administrator
procedures.

Update an article whenever its screen or procedure changes. For business policy,
obtain the business owner's confirmed wording before adding an article, record
the approved document reference in `evidence`, and set its permitted roles.
Rebuild/redeploy the backend to publish updates. Notion/Drive synchronization is
not configured; installing those plugins in Codex does not connect them to this app.
Fees, refunds, business hours and other absent policies must remain undocumented
until confirmed. The assistant directs unsupported questions to a manager.

The initial guide is small, so the backend supplies the complete role-filtered
guide on each request. No external index, file upload, or database copy is needed.
If the guide grows substantially, add permission-aware retrieval with the same
source IDs and answer validation.

## Required maintenance with future changes

Every dispatcher feature change includes its help update in the same PR and
release, including backend changes to permissions, validation, timing or side
effects. `AGENTS.md` gives coding agents the same instruction. Update the actual
article content, affected `reviewedAt` dates and `evidence`; add/remove destinations
in both backend and dispatcher definitions when screens change. For changes with
no staff-visible effect, re-review the affected guidance and document that outcome
as described in `AGENTS.md`; never invent new steps just to satisfy the check.

Run `npm run check:dispatcher-help -- <base-ref>` locally. GitHub CI checks the
whole PR against its base, or the complete push against its previous commit.
Runtime code, styles, dependency and schema changes require an accompanying
knowledge-file update. A new branch compares against main. Missing history fails
closed; checkout uses full history. This check verifies that a guide review was
included; it cannot determine whether the prose is factually correct. Reviewers
must still check the affected procedures against the implementation.

Automated maintenance tests compare the real `ActiveTab` union with client help
links and article coverage, check evidence files and source IDs, and enforce
administrator-only source filtering. A new dispatcher destination without a
guide fails tests. Deployment must include the backend knowledge; if help links
or suggested questions changed, deploy the dispatcher too. Neither branch tests
nor a PR mean the guide is already live.

## Audit notes and smoke questions (2026-10-26)

- Dispatcher Standards is the destination for expectations and consequences.
  Daily Responsibilities still exists under Show more in the audited code; its
  guide explains the separate checklist without claiming it was removed or
  treating its loaded tasks as current owner-approved policy.
- Published standards and pinboard notes are live records, not copied into the
  AI prompt. Policy edits appear in their screens; the assistant directs staff
  there and must not claim to read their saved wording.
- Auto dispatch uses the direct customer route; the map preview includes pickup
  stops. Pre-dispatch editing affects dispatch timing, not the delivery deadline.
- Catalog UNKNOWN pickup types are hidden from order suggestions. Creator
  Unknown is a different concept. Manual-order internal notes can save while
  typing even when the form is later cancelled.
- Receipt View/Send uses the saved receipt fields and structured retained order
  evidence. Staff must verify the saved breakdown before sending; they must not
  invent preset amounts or remove item descriptions/notes that are required
  transaction evidence.
- PR 93 adds an administrator-only Privacy requests destination and four additive
  privacy migrations. It does not expose privacy controls to dispatchers. The
  existing full-guide prompt is larger; real model latency and answer quality
  should be checked after rollout.
- The order-alarm and B&D-alert guides were re-reviewed against the renamed
  `*Panels.tsx` implementations; their operator steps and side effects remain
  unchanged.

With an authorized staff session, ask these read-only questions, expand the
source and follow its navigation without performing the described operation:

1. Where do I find dispatcher standards? Follow-up: Can you tell me the current fee?
2. How do I handle a customer follow-up? Follow-up: Does Handled message the customer?
3. Why is an UNKNOWN catalog item missing from suggestions?
4. Does Acknowledge assign the driver? Follow-up: Why is acceptance still alarming?
5. Does editing pause the 40-minute delivery warning?
6. Does auto dispatch use pickup stops? Follow-up: How do I compare pickup ETAs?
7. How do I find an old order by address across all dates?
8. What gets copied by Load Different Previous Order?
9. If I cancel a manual order draft, are its internal note changes undone?
10. As admin, how do I read Logout Log or turn B&D Emails off? As dispatcher,
    confirm those private guides are not available as sources.
11. As admin, where do I preview and complete a verified privacy request? As a
    dispatcher, confirm that guide is not available as a source.
12. Why can I not work around a blocked manual order by changing the phone number?
13. Which saved receipt and order details must remain as financial evidence?

Affected guide IDs for the PR 93 integration review are `navigation`,
`privacy-requests`, `manual-order`, `edit-order`, `receipts`, `order-alarms` and
`bnd-alerts`.

The help UI retains the existing red/dark styling. Source-navigation validation
recognizes all current pages, and suggested questions include standards,
follow-ups and catalog visibility.

## Boundaries and validation

The model returns a structured answer, steps, notes and source IDs. The server
resolves citations and navigation from its own permitted articles. An answer
without valid sources becomes a fixed undocumented response. This verifies
citations, not the factual accuracy of every generated sentence; check real
answers against their source guides during rollout and after knowledge changes.
Questions/history are explicitly untrusted; there are no execution tools.
Only user/assistant turns are accepted, with 2,000-character questions and the
last 8 history messages (6,000 characters each). Requests are limited to 30 per
staff account per 15 minutes, responses use no-store caching, and provider errors
are sanitized. OpenAI response storage is disabled with `store: false` (this
does not override the provider's other retention policies).

Chat history is held only in React memory. It survives tab navigation, clears on
sign-out/reload/new conversation, and is sent to OpenAI for follow-up context.
No additional chat database or application logging of question bodies is added.
The tab reminds users not to include private customer details.

Automated tests cover authentication, inactive/revoked sessions, role filtering,
rate limits, input bounds, source validation, follow-up context, configuration
errors, provider errors/timeouts, and permitted UI destinations.
