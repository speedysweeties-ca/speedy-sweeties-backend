# TEC-04 dependency maintenance — November 12, 2026

Owner: ChatGPT, master-list execution session. Branch:
`maintenance/tec04-dependencies-2026-11-12`.
Base: `6d94878bbfffc6678880ee55dc39693a74e7808f`.
No competing maintenance PR found in the repository's current open PRs. VS Code
should not implement this dependency update concurrently; this note does not
claim another session has read the handoff.

TEC-04 was historically Already done. This is a later maintenance finding, not a
reclassification of the original work: fresh npm audit has five backend entries
(four moderate, one low) and seven dispatcher development-tool entries (moderate).
No high or critical findings were returned. Website audit was previously clean.

Acceptance: remove the three reported vulnerable dependency mechanisms using
compatible, narrowly scoped updates; preserve legacy dependency consumers and
staff/customer workflows; pass clean-install audits and required checks. Prepare
a reviewable PR. A dependency update does not authorize a production release.
No provider, service, database, credential or billing change is involved.

## Primary sources reviewed

- fast-xml-parser stop-node scan: https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories/GHSA-474x-hrwr-fgx4
- glob cancellation: https://github.com/isaacs/node-glob/security/advisories/GHSA-3g3m-2fjr-6pw4
- minimatch preprocessing: https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249
- newer minimatch compile/cache/escape fixes:
  https://github.com/isaacs/minimatch/security/advisories/GHSA-cf2h-pxjq-68xw,
  https://github.com/isaacs/minimatch/security/advisories/GHSA-hqmv-qgp3-jx75,
  https://github.com/isaacs/minimatch/security/advisories/GHSA-c859-jr93-m5j4

Patched ranges were checked against maintainer advisories and current npm package
metadata. The older preprocessing advisory's database range and publisher range
differ; this work does not dismiss audit findings based on that discrepancy.
Newer minimatch 11.x advisories also need consideration; use 11.0.8, not the older
11.0.1 fix in isolation. Do not override the legacy callable minimatch 3.x tree.

## Implemented candidate

- Update fast-xml-parser 5.7.1 to 5.12.0 within Cloud Storage's existing permitted
  version range; retain Firebase Admin, Cloud Storage, google-gax and rimraf
  versions. Associated XML numeric/entity helpers update within that closure.
- Scope a glob14.0.5/minimatch11.0.8 override to **google-gax5 > rimraf5**.
  The existing async `glob` and sync `globSync` calls still work. The smaller glob
  CLI closure removes obsolete transitive CLI packages from the root lock.
- Scope minimatch11.0.8 to **TypeScript ESLint's typescript-estree8** in the
  dispatcher. Retain TypeScript ESLint8.59.0 and every other direct dependency.
  Do not use `npm audit fix --force`: its dispatcher proposal would downgrade the
  direct linter package rather than supply the selected compatible leaf update.
- Legacy callable minimatch3.1.5 remains under ESLint and ts-node-dev/rimraf2.
  No blanket major-version override is applied.
- Re-read driver assignment, Firebase configuration and customer notifier
  implementation. Update reviewed dates/evidence for `driver-assignment` and
  `order-lifecycle`; their existing instructions remain correct and unchanged.
  The scoped Cloud Storage/Firestore dependencies do not enable those services;
  the application imports Firebase app/messaging. No notification was sent.

## Validation on Node 24.22.1

- Clean `npm ci` installs at root and dispatcher succeeded.
- Full npm audits: backend **5 -> 0**, dispatcher **7 -> 0** findings. Fresh
  counts include development/optional dependencies, not only runtime packages.
- Three focused backend compatibility tests passed: async/sync glob selection and
  narrowly matched temporary-file cleanup; legacy CommonJS exports; multipart XML
  round trip, malformed stop-node refusal and SDK imports without provider calls.
- A dispatcher compatibility test passed through the real TypeScript ESLint
  default-project path: the replacement matcher accepts the allowed file and
  obtains the expected number type; ESLint's legacy matcher remains callable.
- Root `npm run check`: **619 passed, 14 environment-gated skips, 0 failures**.
  Uses NODE_ENV=test, non-production synthetic local database/JWT, stub Firebase,
  auto-dispatch off. Hosted guarded database coverage remains a CI requirement.
- Dispatcher `npm run check`: lint/build pass; **72 tests passed, no skips**.
  Seven existing lint warnings, the existing missing local Maps build value and
  >500kB chunk warning remain. No production key was copied into this checkout.
- Prisma formatting, dispatcher-help review check against base and whitespace
  checks passed. Website source/lock/output is not changed by this PR.

## Review and release boundary

Example guide questions: “How do I assign a driver?”; “Does a push prove the driver
saw the assignment?”; “Can I mark an order delivered without a receipt?” Guide IDs:
`driver-assignment`, `order-lifecycle`. Roles, controls, timers, notifications,
privacy gates, reviewer limits and business rules remain unchanged. Tests are
synthetic/offline, not a new Android/iOS device-notification pass.

No database migration, environment/DNS/credential change, new API/provider/service
or billing commitment. Backend redeployment is needed to install the root runtime
closure and publish updated help review dates. The dispatcher change is a build-
tool dependency fix; no source navigation or customer/staff layout changed.
Confirm exact release targets/current configuration before any later deployment.
Current source is review-only: do not merge or deploy without the repository's
explicit exact-revision approval and passing current-head GitHub Actions.
