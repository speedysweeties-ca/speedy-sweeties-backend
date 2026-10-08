# Logout Log

Administrators open **Show more → Logout Log**. Search by staff name, filter by role, and use Newer/Older to browse. Times are displayed in America/Toronto. Recording begins at deployment; historical events are not fabricated.

The log distinguishes client-reported logouts, server rejections, access revocations, driver offline reports, and interrupted authentication checks. A rejected request is evidence of a server decision, not proof that a phone cleared its local session. Database unavailability remains HTTP 503 and is never represented as token expiry.

Existing drivers already report some exits to `/driver/offline` (also `/auth/driver/offline`). Without a `logoutReason`, these are recorded as **Driver app went offline — reason not reported**. Compatible app updates may send `MANUAL_LOGOUT`, `INACTIVITY_TIMEOUT`, or `CLIENT_SESSION_REJECTED` in `logoutReason`. Local-only timeouts, app deletion/storage clearing, or exits while disconnected may never reach the server; they cannot be inferred from a missing heartbeat. This release does not change mobile apps or their logout behavior.

The dispatcher reports a logout-button press through `POST /auth/session-log/logout` with `{ "reason": "MANUAL_LOGOUT" }` before clearing its session. Authenticated reports can only describe the caller and use a strict reason allowlist. Reports are limited to 10 per minute per account. Reading `GET /auth/session-log` is restricted to administrators. This reporting endpoint records evidence; it does not change authentication or revoke any additional session.

Passwords, tokens, email addresses, raw user agents, IP addresses, request bodies and request URLs are excluded. App names are inferred from a normalized user agent and may be unknown. The displayed source for an administrator action is the administrator's client. Staff identity comes from verified authentication or the server action, never unsigned token decoding or a caller-supplied user ID. Expired-token attribution still verifies its signature, and never authorizes a request.

Repeated server rejections/check interruptions for the same token, reason and client are grouped within five-minute windows. The database keeps the event time and staff/actor identifiers with name snapshots where available. It does not store the token; the deduplication key is a domain-separated HMAC and is excluded from the read API.

Recording is asynchronous and must never block authentication or change whether access is granted. On database write failure, up to 500 pending events stay in a memory buffer and retry every 30 seconds. Each event is also emitted as `STAFF_SESSION_EVENT` in Render service logs. A process restart or full buffer can leave an event available only in Render logs; those logs are the fallback, not a claim of guaranteed database delivery during outages.

The schema change only adds `StaffSessionEvent` and indexes. No existing staff, customer, order, or login records are modified by the migration. Rolling back application code can leave the new table in place.

Verification: `npm test`, `npx prisma format --check`, `npx prisma validate`, and `npm run check` in `speedy-dispatcher`. Regression tests cover admin-only access, caller identity, input validation, expired versus forged tokens, rejection deduplication, outage buffering/recovery, unknown legacy exits, and credential redaction.
