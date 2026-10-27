# Node 24.22.1 security update — original plan and deployment closeout

## Current status

PR 96 was separately approved, merged and freshly deployed at
`c5f249fc079f2faa5ff99c61b193a0626eccc3aa` in API → dispatcher → cron-build order.
API/dispatcher runtime and certificate verification is CLOSED on owner-provided
production Shell evidence; cron remains BUILD-VERIFIED ONLY, with no extra run.
Auto-Deploy is Off on all three. The exact sanitized results and evidence boundaries
are in `docs/production-security-maintenance.md`.

The sections below preserve the original pre-deployment observations, proposal and
verification commands, not a current claim that production is unpatched or that
Auto-Deploy is On. The security source is now being integrated into draft PR 93;
that does not deploy privacy or authorize the protected restore exercise.

## Original review scope (historical)

Prepared 2026-10-26 from current main
`7bcaaf7cfff6f8e45ab0b912f35d61ffd56c7e39`, on
`fix/node-24-22-1-security`. This is separate from draft PR 93. It contains **no
schema/migration, application dependency or business-workflow change**. Nothing has
been merged, deployed, reconfigured on Render, or sent to a customer.

## Observed targets and version control

Workspace: `tea-d7loaul7vvec73cme5d0`. All listed services are native Node runtimes.
Versions below are provider build-log evidence linked to the live deploy, not an
in-container process inspection or proof of the effective CA store.

| Service | Source / live deploy | Observed Node | Disposition |
| --- | --- | --- | --- |
| `speedy-api`, `srv-d7ntlnpkh4rs73bev9q0` | main `7bcaaf7`; `dep-dbej0hks728c73clt3gg` | 24.14.1 default, Oct 24 22:25:28 UTC | Patch with this review |
| `speedy-dispatcher`, `srv-d7m4hgpkh4rs73agsfc0` | main `7bcaaf7`; `dep-dbej0hks728c73clt41g` | 24.14.1 default, Oct 24 22:25:31 UTC | Patch with this review |
| `speedy-retention-90-day`, `crn-da1s3vnqj5pc73d2c63g` | main `7bcaaf7`; `dep-dbej0hss728c73clt4c0` | 24.14.1 default, Oct 24 22:25:23 UTC | Rebuild future scheduled-run artifact; do not Trigger Run |
| `speedy-privacy-isolated`, `srv-dbe3861srm7s73dgfe50` | privacy branch `ef944a0`; `dep-dbfo5mui0phs73d89hq0` | 24.22.1 default, Oct 26 16:42:20 UTC | Already at this Node patch level; leave untouched, no CA-status claim |
| `speedy-ordering-staging`, `srv-davc147avr4c73bd7eig` | staging branch `203b399`; `dep-davhiedg1s2s73ahn2q0` | Unverified; Oct 2 build logs no longer returned | Separate branch, not patched by merging this PR; preserve staging and investigate runtime before future use |

On 2026-10-26 Robert inspected Environment for API, dispatcher and retention cron
and reported `NODE_VERSION` **not found in all three**. This is owner-observed
absence, corroborated by the default-version build logs, not a connector read of
all environment values. No environment values were retrieved or changed. The
connector cannot list environment variables/groups; no authenticated CLI/API read
session was available. Effective trust overrides remain a private pre-deploy check.

Render precedence is `NODE_VERSION` (direct service value wins over a linked group)
→ `.node-version` → `.nvmrc` → package `engines.node` → creation-date default.
Multiple groups defining the same variable have no guaranteed precedence. Existing
main has no repository pin, so the three observed default selections are expected.
No Render Blueprint is checked into main; do not introduce one for this update.

The patch pins `.node-version` and `engines.node` to **24.22.1** at both repository
root (API/cron) and `speedy-dispatcher/` (Render rootDir). The dispatcher's copy is
needed because files outside that rootDir are unavailable to its build/runtime.
Lockfile edits add only root engines metadata; every dependency version, integrity
and resolved dependency edge is unchanged. `prebuild` rejects a different Node
version before TypeScript/Vite. If an override appears later, do not weaken the
guard: reconcile only that override through a separately approved settings change.

CI reads the root pin, checks both roots before other scripts, and runs all tests
serially. It retains dispatcher-help validation and the existing PostgreSQL 18
timing-history validation. PR 93's privacy job and four migrations are not imported.

## Compatibility evidence

- Official macOS ARM64 Node archive verified against Node's SHA-256 manifest;
  temporary runtime reported `v24.22.1`, OpenSSL `3.5.9`. System Node was unchanged.
- Clean backend install, Prisma generation/validation/format and TypeScript build
  passed. Serial backend suite: **422 passed, two database-only tests skipped**.
  Those two integrations run against disposable loopback PostgreSQL 18 in CI.
- Six new focused checks cover consistent pins, rejection of an older override,
  CI ordering, normal Brotli round-trip, and the actual compiled retention cron with
  fully stubbed Prisma: DRY_RUN creates only a synthetic audit row; SEND is rejected
  before any customer read/write. No real cron, database or provider was invoked.
- Dispatcher clean install, lint and **66 tests passed**, including the production
  HTTP server's asset/SPA/staff-password, Host, method, headers and source-blocking
  checks. Local Mac build fails on main's existing case-only module collision:
  `IncomingOrderAlarm.tsx` versus `incomingOrderAlarm.ts` and `BndOrderAlerts.tsx`
  versus `bndOrderAlerts.ts`. These source files and compiler dependencies are
  unchanged. Require the exact-head Linux CI production build; do not rename
  unrelated modules as part of this security patch. See PR checks for Linux results.
- Dispatcher-help guard passed. `navigation`, `bnd-emails`, `customer-retention`
  guidance was re-reviewed as unchanged, with dates/comment updated per AGENTS.md.
  Example questions: "How do I refresh Live Orders?", "Does silencing B&D sound
  disable email?", "Does Customer Retention automatically send a campaign?"
  These are mocked-test/review examples, not live AI requests.
- Local `fetch` and `node:https` each accepted ordinary HTTPS to `nodejs.org` (307)
  and rejected both advisory test chains with **CERT_REVOKED**. Only status/code was
  recorded. This does not verify production certificates or any provider account.
- Both `npm audit --omit=dev --audit-level=high` checks passed with zero findings.
  Backend full-tree audit also reported zero. Dispatcher full-tree audit reports
  development-only `postcss-selector-parser` (moderate, GHSA-rj75-hqrm-r3gf) and
  `zod` (high, GHSA-mrhx-c7xc-m3w5); both installed entries are `dev: true`.
  They are not the Node/eMudhra advisory and no dependency upgrade is bundled here.
  This is not a claim that the entire development tree is vulnerability-free.
- Mac resource checks: approximately 2.3 GB disk free / 48% memory free before
  work; one temporary Node runtime, one serial build/test process, no simulator or
  local PostgreSQL. The user's existing npm cache was not repaired/overwritten;
  an initial cache-permission failure was resolved with a task-specific cache.

## Exact fresh-build proposal (requires separate approval)

1. Require green CI on this PR's exact head, then recheck main, the three live
   deploys, and the proposed merge tree. `git diff <reviewed-main>...<approved-head>
   -- prisma` must be empty. Stop if unrelated source or any privacy migration is
   included. Preserve the pending recovery exercise below; this PR does not mark
   it complete or authorize a clone.
2. **Before any approved merge**, disable auto-deploy on all three main-tracking
   services (currently On Commit). Record current commit/deploy, commands and safe
   configuration facts. Do not change staging/SMS services, schedules, provider
   settings, privacy flags, secrets, or environment groups. The cron schedule is
   `0 14 * * *` UTC; do not Trigger Run or alter its DRY_RUN policy.
3. Recheck each Environment page for direct/group `NODE_VERSION`; owner-observed
   absence means **no new NODE_VERSION setting is necessary**. Keep it absent and
   let the reviewed source pin control the runtime. If a conflicting override is
   found, stop for a narrowly scoped correction; never change a shared group as a
   shortcut. Privately inspect `NODE_OPTIONS`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`,
   `SSL_CERT_DIR`, and `NODE_TLS_REJECT_UNAUTHORIZED` for custom/insecure trust.
   Record presence/findings only, not secrets or full environment output. Do not
   disable TLS validation or apply a trust-store workaround instead of the patch.
4. For reproducible dependency installation, propose these exact build commands
   (the latter two replace existing `npm install` with `npm ci`; not changed now):

   - API, root empty: `npm ci --include=dev && node ./node_modules/prisma/build/index.js generate && npm run build`
   - Dispatcher, root `speedy-dispatcher`: `npm ci --include=dev && npm run build`
   - Cron, root empty: `npm ci --include=dev && npx prisma generate && npm run build`

   Preserve API pre-deploy `npx prisma migrate deploy` and start `npm run start`;
   dispatcher start `npm run preview -- --host 0.0.0.0 --port $PORT`; cron command
   `npm run retention:90`. Before the API pre-deploy, read-only schema/migration
   comparison must establish no pending/failed migration from reviewed main (last
   observed `20261022170000_bnd_waiting_history`). Expected result is no migration
   applied. Do not remove the hook, run manual migrations or mark failures resolved.
5. After separate merge/deploy approval, record the exact merged SHA. Build **API,
   then dispatcher, then cron** one at a time, stopping at any failed check. Use
   Dashboard **Manual Deploy → Deploy a specific commit** with that SHA for the web
   services; verify a fresh build occurs, not Restart or Save and deploy of an old
   artifact. For a cache-cleared build, use **Clear build cache & deploy** only after
   confirming linked main still equals the approved SHA, otherwise use the API's
   specific-commit fresh-build option. The current connector cannot select a SHA,
   so it must not be used if main moved. Build the cron artifact from its Builds
   page, not Runs/Trigger Run; a new build applies only to future scheduled runs.
   This does not authorize an extra run or customer audit writes for testing.
6. Record new deploy/build IDs and source SHA, require the build log's Node version
   **24.22.1** and successful prebuild assertion, and then verify the running web
   instances as below. Render refreshes native system certificates on a fresh build;
   restarting an old instance/artifact is not evidence of this update. Keep
   auto-deploy off until the separate rollout review is complete.

## Runtime, certificate and no-side-effect verification

Use each **existing web service's authenticated Shell** (not a new paid ephemeral
instance). First run:

```sh
node -p 'JSON.stringify({node:process.version,openssl:process.versions.openssl})'
dpkg-query -W ca-certificates
node -p 'JSON.stringify({nodeOptionsPresent:!!process.env.NODE_OPTIONS,extraCAPresent:!!process.env.NODE_EXTRA_CA_CERTS,certFilePresent:!!process.env.SSL_CERT_FILE,certDirPresent:!!process.env.SSL_CERT_DIR,tlsValidationDisabled:process.env.NODE_TLS_REJECT_UNAUTHORIZED==="0"})'
```

Require Node 24.22.1, review any trust override privately, and confirm this Shell
belongs to the new deploy. These entrypoints start `node` without extra flags;
verify that remains true. A package version alone is not an effective-trust test.
Run the following bounded, read-only probe in that same environment. It imports no
application code, adds no credentials/auth headers, follows no redirects and reads
no response bodies. The API's provider code uses global `fetch`; `https` also
checks Node's ordinary TLS path. Do not replace this with a Mac/curl test.

```sh
node --input-type=module <<'NODE'
import https from 'node:https';
const probes = [
  ['ordinary-tls', 'https://nodejs.org/'],
  ['compromised-chain-a', 'https://dv-g3b-emudhra.we-have-a-problem.com/'],
  ['compromised-chain-b', 'https://dv-g3b-aaa-emudhra.we-have-a-problem.com/']
];
for (const [probe, url] of probes) {
  for (const client of ['fetch', 'https']) {
    try {
      let status;
      if (client === 'fetch') {
        const response = await fetch(url, {method:'HEAD', redirect:'manual', signal:AbortSignal.timeout(8000)});
        status = response.status;
        await response.body?.cancel();
      } else {
        status = await new Promise((resolve, reject) => {
          const request = https.request(url, {method:'HEAD', signal:AbortSignal.timeout(8000)}, response => {
            response.resume(); resolve(response.statusCode);
          });
          request.once('error', reject); request.end();
        });
      }
      console.log(JSON.stringify({probe, client, outcome:'http_response', status}));
    } catch (error) {
      const raw = error?.cause?.code ?? error?.code ?? error?.name;
      const code = typeof raw === 'string' && /^[A-Z_0-9]{1,80}$/.test(raw) ? raw : 'UNCLASSIFIED';
      console.log(JSON.stringify({probe, client, outcome:'rejected_or_unavailable', code}));
    }
  }
}
NODE
```

Pass requires an ordinary HTTPS response and certificate-validation errors for
**both bad chains in both clients** (locally all four were `CERT_REVOKED`). Any HTTP
response for a bad chain fails. DNS/timeout/network failures are **inconclusive**,
not a pass. Do not automatically repeat probes to hide a failure. Review the Node
version, trust configuration and exact error before proceeding.

Cron has no continuously running web process or HTTP health check. Its build pin
and build logs prove the new artifact runtime selection, not a post-build running
TLS probe. If a build-only shell is available, run the probe there without invoking
the job and label it **build-environment evidence**. Otherwise leave that check
explicitly pending; do not create another service, replace the job command or
Trigger Run just to obtain it. No custom HTTPS provider client is imported by the
existing cron; its business operation is PostgreSQL-backed DRY_RUN auditing.

After each web deploy, GET API `/api/v1/health/ready` and `/api/v1/health/live`, or
dispatcher `/`, `/?staff-password=1` and one referenced static asset. Check expected
HTML/assets, non-secret security headers and blocked source paths. Observe existing
staff-session order-list GETs only if an authorized session already exists. Do not
POST a login/order/help question, fetch loyalty state (can reset monthly counters),
trigger dispatch/alerts, message a customer, run cron, or invoke privacy routes.
API startup already starts operational monitors/repairs; a future deployment is an
operational restart, not a side-effect-free test. No new startup behavior is added.

## Stop/rollback boundary and preserved recovery work

Stop for wrong source/runtime, a new/pending migration, build/health failure,
unexplained TLS/provider connectivity regression, or a trusted compromised chain.
Before a successful swap, retain the old instance and investigate. No schema change
is introduced, so no database rollback is part of this update. Prefer a reviewed
forward fix or a fresh build of prior healthy `7bcaaf7` code with an explicitly
patched runtime. Artifact rollback can restore old environment/build choices and
must not be labelled a security fix; reverify runtime and certificates afterward.
Render's platform-level updates are not rolled back, but do not assume that makes
an old artifact safe. Recheck auto-deploy after any separately approved rollback.

The approved retention decisions and pending protected restore exercise remain
unchanged on PR 93's branch at
[`59e6e13`](https://github.com/speedysweeties-ca/speedy-sweeties-backend/blob/59e6e13570a7e33d015abbcf001d6b378eb6407c/docs/privacy-technical-configuration.md).
Owner-observed three-day PITR and at-least-seven-day export retention remain known;
exact recovery-point acceptance, quote, creation approval and successful restore
are still pending. This security PR neither creates the clone nor copies those
privacy migrations/configuration into main. Integrating this security patch into
PR 93 later requires a separate review; do not silently merge the branches.

Sources inspected 2026-10-26: [Render advisory](https://render.com/docs/advisory-emudhra),
[Node 24.22.1 security release](https://nodejs.org/en/blog/release/v24.22.1),
[Node selection](https://render.com/docs/node-version),
[environment precedence](https://render.com/docs/configure-environment-variables),
[monorepo roots](https://render.com/docs/monorepo-support),
[deploy lifecycle](https://render.com/docs/deploys),
[cron builds versus runs](https://render.com/docs/cronjobs),
[rollback scope](https://render.com/docs/rollbacks).
