# Dispatcher help source verification — November 12, 2026

## Observed behavior and evidence limits

The authenticated production dispatcher loaded Live Orders without an error
(empty result), and Customer Follow-ups opened with zero waiting requests and
empty Waiting/Handled views. The assignment answer cited `driver-assignment`
with review date 2026-11-12. Its source navigation opened Live Orders.

The follow-up "Can I mark it delivered without a receipt?" returned
NOT_DOCUMENTED. A more explicit follow-up, "Can I mark an order DELIVERED without
saving a digital receipt?", answered correctly and cited `order-lifecycle`,
reviewed 2026-11-12. Both guides expanded normally. No order, complaint, review,
share, staff handling action or customer notification was created.

The precise cause of the short follow-up's refusal is unknown: the application
does not retain raw model replies. This observation does not establish that
dependency maintenance caused it. A separate code review found that invalid or
missing citations on ANSWERED were collapsed into NOT_DOCUMENTED, misleadingly
presenting a verification failure as absent documentation.

## Proposed correction

- Invalid or inaccessible citations, and ANSWERED with no citations, return a
  safe HTTP 502 verification error. Unverified instructions are never returned.
  The existing dispatcher error UI retains the question and offers Try again.
- The strict Responses API schema restricts source IDs to the authenticated
  role's reference articles. Server-side validation remains independent.
- Instructions explicitly use history to resolve follow-ups and ask CLARIFY
  when the referent remains ambiguous. History is context, never policy evidence.
  This prompt change is not proof of future model quality.
- The provider receives article ID, title and content only. The server continues
  to supply trusted source dates, content and navigation metadata to staff.
- Genuine unsupported policy still returns NOT_DOCUMENTED with no operational
  steps. CLARIFY still strips steps/notes/sources. Receipt requirements and the
  `driver-assignment` / `order-lifecycle` articles remain unchanged.

Affected guide: `help-guide`, reviewed 2026-11-12, now explains the difference
between a verification error and undocumented policy. Authentication, role
filtering, rate limit, no-store response, timeouts, storage-disabled provider
requests, output limit and no-tools/no-actions behavior remain unchanged.

OpenAI's current [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
documents enum support in strict JSON schemas; inspected November 12, 2026.

## Cost and release boundary

Robert explicitly chose reuse of the existing OpenAI connection on November 12.
No new key, service, model, request frequency, automatic retry or background task
is introduced. Existing metered requests remain metered; no precise cost saving
is claimed from removing reference metadata. All local provider tests are mocked.

Backend-only candidate. No dispatcher build deployment, environment change,
database migration, privacy gate change or other service deployment is required.
Prepare checks and exact-head CI before requesting explicit merge/deploy approval.
Current healthy API source is `cfcc8b613f82f4870e7f9fef28206af51bd2337f`,
deploy `dep-dbqldlqjnfac739285sg`; reconfirm health/config before using a rollback.

After an approved API release, use an authorized staff session for an assignment
question, the short receipt follow-up, an explicit receipt question and an
unsupported policy question; inspect sources/navigation. These acceptance checks
must not create an order or customer complaint. Mocked tests cannot guarantee
live answer quality. A verification failure must be shown as an error, while
undocumented policy must still direct staff to the manager.

## Local validation

- Clean root and dispatcher installs with pinned Node 24.22.1.
- Backend check: 620 passed, 14 database-gated skips, zero failures.
- Dispatcher check: 72 passed; lint/build passed with the existing seven hook
  warnings, absent local Maps build key and large-chunk warning.
- Root and dispatcher audits: zero advisories each.
- Prisma format check, dispatcher-help review check against base `cfcc8b6` and
  whitespace check passed. No lockfile, schema, generated output or secret change.
- Regression checks cover role-specific outgoing citation enums, invalid/missing
  citations, sanitized HTTP 502 responses, supported source metadata, conversation
  forwarding, unsupported policy, clarification, authentication and rate limits.

Hosted exact-head CI and post-release model acceptance are separate from these
local results. The existing receipt rule was verified live before this candidate;
no live model request has tested this proposed correction yet.
