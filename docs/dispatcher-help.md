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
plain-language content and code/document evidence for maintainers. Initial
articles were verified against repository commit `3bec1b0` on 2026-09-30.

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
