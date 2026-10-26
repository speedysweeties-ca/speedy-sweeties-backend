# Production security maintenance — 2026-10-22

This release addresses the dependency advisories identified during the efficiency
review and replaces the dispatcher's development preview server. It does not
change order polling, GPS refresh intervals, editing pauses, B&D monitoring,
authentication rules, email reporting or dispatch business logic.

## Dependency changes

Backend lockfile updates stay within the existing dependency ranges:

| Package | Before | After |
| --- | --- | --- |
| @fastify/busboy | 3.2.0 | 3.2.4 |
| @grpc/grpc-js | 1.14.4 | 1.14.6 |
| brace-expansion (development tree) | 1.1.18 | 1.1.21 |
| brace-expansion (Google dependency tree) | 2.1.4 | 2.1.7 |
| ip-address | 10.5.0 | 10.7.4 |
| morgan | 1.12.0 | 1.12.1 |
| proxy-addr | 2.0.7 | 2.0.8 |

Dispatcher adds Express 5.3.0 and Helmet 8.3.0 as pinned runtime dependencies.
The development/build tree updates Vite to 8.3.5, source-map-js to 1.2.2,
brace-expansion to patched compatible versions, and their required dependencies.
There is no Tailwind major-version migration or application component change.

Both `npm audit --omit=dev --json` reports contain **zero known runtime
dependency vulnerabilities** at validation time. CI now rejects high/critical
runtime dependency findings. This is a package-advisory result, not proof that
the entire application is free of security defects or that no breach occurred.

Remaining full-tree findings are documented, not suppressed:

- Backend: three high entries through the ts-node-dev/chokidar/braces development
  watcher. Production starts compiled JavaScript and does not run that watcher.
- Dispatcher: five high and two moderate entries in the Tailwind 3 build chain
  (braces/chokidar/micromatch/fast-glob and postcss selector parsing). The build
  consumes repository-controlled sources, and production serves only `dist`.
  Fixing the upstream chain currently calls for a separate Tailwind major upgrade,
  with visual regression testing. Do not use `npm audit fix --force` blindly.

Render still installs build dependencies to compile both applications. They are
not imported by either production entrypoint and are not served as static files.
Build-tool risk is therefore separate from a runtime/public-route vulnerability;
repository and build access must remain restricted.

## Dispatcher production server

`server.mjs` serves only the compiled `dist` directory with Express. It retains
SPA navigation, the `?staff-password` entry flow, static asset content types, and
the existing public hostname. It rejects invalid hosts, source/dev endpoints,
dotfiles, source maps and write methods. Forwarded Host headers are not trusted.
Errors do not expose filesystem paths or stack traces. HTML is not cached.

Helmet adds MIME-sniffing, framing, referrer and other response protections. The
new CSP restricts base URLs, objects and embedding. It deliberately does not add
a script/connect/image allowlist without separate Maps/printing integration
validation. The prior Vite preview server had no CSP. External B&D windows remain
compatible with the opener policy. This is not a claim of comprehensive XSS
prevention.

`npm start` and `npm run preview` now run the production server. The latter is a
compatibility alias for Render's existing command:

```
npm run preview -- --host 0.0.0.0 --port $PORT
```

`PORT` is authoritative, the server binds to `0.0.0.0`, and SIGTERM drains requests
with a bounded shutdown. `npm run preview:local` retains Vite preview for local
development only. No Render dashboard, environment, URL, paid-plan or database
change is required.

## Validation and rollout

- Backend clean install/check: 411 passed, two isolated-database tests skipped
  locally; Prisma formatting passed. CI runs the database tests with PostgreSQL.
- Dispatcher clean install, lint, tests and build: 66 passed, including HTTP
  security tests for real files, traversal/dotfile attempts, development routes,
  Host validation, missing assets, SPA navigation, HEAD, headers and write methods.
- A separate production-process smoke check served the actual built JS/CSS and
  staff-password page, blocked source/package files, and exited cleanly on SIGTERM.
- After deployment, verify both exact Render deploys, API database readiness,
  dispatcher HTML/assets, source blocking and response headers. Do not create live
  orders, send notifications or guess staff credentials for validation.
- Local builds do not contain the production Google Maps key. Maps and signed-in
  workflows have not been exercised using a real staff session in these tests.

Production targets remain API `srv-d7ntlnpkh4rs73bev9q0` and dispatcher
`srv-d7m4hgpkh4rs73agsfc0` in Speedy's workspace `tea-d7loaul7vvec73cme5d0`.
Prior healthy code: `80a473b61704a5b2d81c3d166f860daec04100f3`. There is no database
migration. The API health path `/api/v1/health/ready` remains compatible with that
rollback commit. Reverting this release also restores the old dependency tree
and preview server, so a rollback would be a temporary recovery measure.

References:
- https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h
- https://vite.dev/guide/static-deploy
- https://helmet.js.org/
- https://render.com/docs/deploys
- https://render.com/docs/health-checks

## 2026-10-26 runtime advisory assessment — action required, not remediated

Render's email "Important advisory on recent industry security disclosures" was
received on 2026-10-26 at 18:12:42 UTC. The linked eMudhra advisory was initially
published October 22; the email date is not a new patch date. Assessment used the
actual live deploys and narrowly filtered build logs, not a package-audit result.
No production configuration, service, database or application source was changed.

### Observed production runtime

Both native Node services remain on main
`7bcaaf7cfff6f8e45ab0b912f35d61ffd56c7e39`:

- API `srv-d7ntlnpkh4rs73bev9q0`, live deploy `dep-dbej0hks728c73clt3gg`:
  `Using Node.js version 24.14.1 (default)` at
  `2026-10-24T22:25:28.119021204Z`.
- Dispatcher `srv-d7m4hgpkh4rs73agsfc0`, live deploy
  `dep-dbej0hks728c73clt41g`: the same version at
  `2026-10-24T22:25:31.313220566Z`.

These are provider build records tied to the live revisions; an in-container
`process.version` read-back was not obtained. The API uses `node dist/server.js`;
dispatcher uses `node server.mjs`. Neither deployed package manifest has an engines
pin, and main contains no `.node-version` or `.nvmrc`. Render's default is tied to
service creation date, not the date of the latest deploy: the observed 24.14.1 is
consistent with these April-created services. Merely rebuilding without a version
pin must not be assumed to select the new default.

### Conclusion and certificate evidence limit

**Action is required:** 24.14.1 is below the advisory's patched 24.22.1 threshold
for Node 24. The Node 24.22.1 security release includes TLS/Brotli fixes, updated
root certificates and blocked compromised certificate keys. This establishes a
runtime version gap, not that Speedy Sweeties was exploited or that every listed
vulnerability is reachable in this application. The separate PHP instructions are
not applicable to these inspected native Node entrypoints.

The system CA package/update status and effective running-process trust overrides
remain **unverified**. Narrow build-log searches returned no CA-update entry; that
absence proves neither patched nor unpatched system certificates. Repository search
found no custom CA/Node trust overrides, but production environment values were not
retrieved. A read-only API SSH attempt verified Render's published Ohio host key,
then failed `Permission denied (publickey)` before running commands. Browser/Shell
access was unavailable. No credentials or full environment were printed.

Render says a fresh native-runtime build updates the system trust store. Node can
use its own trust material, so an October 24 build or a system package update does
not substitute for the Node upgrade. Healthy HTTP responses and the earlier
zero-runtime-npm-advisory result do not prove this advisory resolved. CI's Node 22
runner also does not establish the production Node 24 patch level.

### Smallest proposed remediation (requires separate approval)

1. Pin `NODE_VERSION=24.22.1` on **each named production Node service**, or a later
   reviewed patched Node 24 version. Review existing runtime/trust overrides
   privately; do not dump environment values. Do not disable certificate validation
   or use a custom-trust workaround to avoid the runtime security fixes.
2. Validate the same-major runtime change with focused build/start checks, then make
   a **fresh build and deploy**, not a restart, of the exact approved current-main
   revision on each service. Keep this independent of draft PR 93; no privacy merge,
   activation or new migration is needed. Recheck main's migration history before
   the API's existing `prisma migrate deploy` hook runs. Do not select "latest" if
   main has moved beyond the separately reviewed revision.
3. Read back the new deploy ID/source and Node version from its build and running
   process; record system CA package version if available. Dashboard Shell commands
   `node -p 'JSON.stringify({node:process.version,openssl:process.versions.openssl})'`
   and `dpkg-query -W ca-certificates` print no application secrets. Package version
   alone still does not prove effective trust. Do not create a paid ephemeral shell.
4. With approved running-service access, test certificate rejection using the
   application's Node HTTP client against the two benign test endpoints linked in
   Render's advisory. A certificate-verification rejection is the expected result;
   timeout/DNS failure is inconclusive, and any HTTP response means trust remains.
   Never attach provider credentials, customer data or auth headers. A Mac/curl test
   is not equivalent to the production application's trust configuration.
5. Check API readiness/liveness and dispatcher HTML/assets with no orders, dispatch,
   verification, notifications or other live mutations. If regression requires code
   recovery, preserve the patched runtime where compatible; restoring an old build
   can restore vulnerable runtime/certificates and must not be labelled remediation.

Sources inspected 2026-10-26:

- [Render eMudhra advisory](https://render.com/docs/advisory-emudhra)
- [Render Node version precedence and defaults](https://render.com/docs/node-version)
- [Node 24.22.1 security release](https://nodejs.org/en/blog/release/v24.22.1)

The protected restore proposal remains in `docs/privacy-technical-configuration.md`.
Neither that proposal nor this assessment grants deployment/resource-creation
approval. No certificate test, runtime change or production rebuild was performed.
