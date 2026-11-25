# Safe dispatcher software updates

The login flow reads the serving dispatcher's no-store `dispatcher-version.json`
before sending credentials. Existing successful `/orders` responses expose
`X-Dispatcher-Release`; a changed identity triggers a manifest check (at most once
per 30 seconds of existing order responses while versions differ). There is no
new periodic polling timer. Manifest failures do not sign out staff.

The backend header is a build-time SHA-256 of dispatcher source and build inputs.
The frontend embeds the same identity and emits it in the manifest. The API must
be rebuilt/deployed whenever dispatcher sources change, including dispatcher-only
fixes. Deploy API then dispatcher from the same commit. A header alone never
causes reload: the serving manifest must confirm a different release. While the
frontend is still deploying, old pages retry using existing order responses.
Backend-only changes do not interrupt staff. Environment-only changes require a
source change/release to announce them. Initial installation requires one manual
refresh of already-open pages, since those pages have no detector yet.

Automatic reload is limited to visible Live Orders with no open/dirty main editor,
no pending driver selection, no registered child draft (including hidden screens),
and no API writes. Activity or focused editing controls reset the 10-second idle
grace period. Keep working defers until logout/login. Uncertain write responses
hold automatic reload for the session. Manual logout/refresh still discards drafts.
Drafts and credentials are never copied into update storage.

The update sign-in gate and loop guard are per browser tab in sessionStorage.
Updating one tab does not delete the shared login token, revoke server sessions or
force other tabs/devices off unfinished work. The updated tab ignores that token
until an explicit successful login. This is a UI reauthentication gate, not a
security revocation mechanism. Existing administrator Force Logout is unchanged.
A cache-busting navigation loads no-store HTML and Vite's content-hashed assets.
Only one reload per source/target pair per tab is attempted, avoiding stale-cache
loops. A failed loop is surfaced for manual refresh after saving work.

## Verification and rollout

No database migration, new service, dependency or paid integration is required.
Build both packages from one commit. Confirm manifest and API header match before
announcing rollout. Verify: clean idle tab updates; manual order, saved-address,
pinboard, standards, staff and follow-up drafts hold it; in-flight/failed saves
hold it; Keep working defers; another browser tab's draft survives; login checks
load the new version; offline/malformed manifests never force sign-out.
Help guide: `navigation`. Example questions: “Will updates lose my unfinished
order?” and “Why does Dispatcher update ready say Keep working?”

## Implementation validation (2026-11-25)

Clean installations and full checks passed on pinned Node 24.22.1: 639 backend
checks passed (15 environment-dependent tests skipped), and 83 dispatcher checks
passed including lint and production build. Both dependency audits reported zero
advisories. Prisma format/schema and the dispatcher help review gate passed.
The API build identity matched the generated dispatcher manifest.

Ten local Chromium scenarios used synthetic API responses: idle update to login,
hidden manual-order draft, hidden pinboard draft, Keep working, outstanding write,
interrupted write, login-before-credentials update, hidden standards editor,
hidden staff-profile draft, and another browser tab retaining its order draft.
No production records, sessions or settings were changed by these tests.
