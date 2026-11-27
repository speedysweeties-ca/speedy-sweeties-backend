# November 23 dependency maintenance — review only

Baseline main: b6eebb07ecc3e848db5a80298d2facb9487eeebd.
Live API: 21df44b0399cd4ea0ee015b8d6a150a5d4475b6a.
Live dispatcher: 41eafa2cc097aa85941952758954e806795afc24.
Both production services were reverified in Speedy's workspace, tracking main
with Auto-Deploy off. No production deployment occurred since the prior review.
Main's intervening change is website FAQ work; no operational backend change.

## Repair

GHSA-7589-6fvf-x4pw affects Effect <=3.22.0 and is patched in 3.22.1:
https://github.com/advisories/GHSA-7589-6fvf-x4pw
The backend lock resolves Effect 3.21.0 through @prisma/config 6.19.3 / Prisma
6.19.3. The initial audit reports three high entries for this one advisory.
Although Prisma is a development dependency, this chain is devOptional and the
production-omitting audit includes it. Do not dismiss it as development-only.
No application use of the vulnerable TemplateLiteral pattern was established;
this is a dependency vulnerability and CI blocker, not evidence of exploitation.

Pin only @prisma/config@6.19.3's Effect dependency to 3.22.1. No Prisma major
upgrade, schema, migration, operational logic, settings or frontend change.
The lock diff changes only Effect's version, URL and integrity. Keep this scoped
override under review when upgrading Prisma; remove it when upstream resolves a
patched compatible dependency without it.

The isolated regression decodes a valid template and rejects 5,000 colons,
then checks Prisma configuration construction. A child-process timeout prevents
the vulnerable synchronous regex hanging the suite. On 3.21.0 this test was
terminated at three seconds; on 3.22.1 it passed in approximately 340 ms locally.
This reproduces the dependency flaw without exposing a network endpoint or data.
Prisma generation, validation and the full build/tests provide compatibility
coverage beyond that focused test. CI must pass on the exact review head.

## Help and release considerations

Re-reviewed help-guide: source validation, role filtering, navigation and staff
procedures remain unchanged. Only the review comment/date changes. Example smoke
question: "How do I use a Source guide?" No competing help-only content changes;
PR 152 remains separate and must be refreshed after this repair is approved.
Neither PR is authorized for merge/deployment by this maintenance review.
No production database commands or external messages were executed.

## Other findings

Bounded Render logs for November 16–23 returned 53 driver-assignment push failures
with messaging/third-party-auth-error (observed November 18–22). The log result is
not an all-time failure count. This recurs from the previous review. No credential
values were inspected; a provider credential/configuration diagnosis is required,
not speculative application retries. Existing code retries explicit transient
server errors only; do not repeatedly retry authentication failures.

The paginated failed-text search also returned one pickup-hours safe-match refusal
for an existing store, consistent with the prior review. No authoritative place
identity was established, so no location or matching policy was changed.
Error-level-only queries returned no entries despite the push errors above;
text searches are required because these application events are labelled INFO.
API live/ready and dispatcher returned HTTP 200, database OK. No new failed
production deployment was found. Signed-in dispatcher and real push delivery
remain unverified. No live orders, staff/customer changes or test messages.

Local checks on Node 24.22.1: clean npm ci; backend check 624 passed / 14
CI/database-only skipped; dispatcher lint/build and 72 tests passed (seven
existing lint warnings, local unset Maps key and bundle-size warnings). Prisma
formatting and dispatcher-help gate passed. Full backend, production-only backend
and dispatcher npm audits each report zero advisories after the patch.
Exact-head CI results are recorded in the PR rather than inferred from local tests.
