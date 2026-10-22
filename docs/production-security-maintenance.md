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
