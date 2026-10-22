# Dispatch notifications and readiness

Manual and automatic assignment use one driver notification service. Foreground
drivers continue to use the existing order refresh/alarm behavior. Order polling,
B&D monitoring and customer notification flows are unchanged by this release.

## Notification outcomes

Structured `DRIVER_ASSIGNMENT_PUSH` events contain a random correlation ID,
attempt, outcome, and a documented Firebase error code. They never contain device
tokens, driver/customer identifiers, addresses, notification bodies, credentials
or raw provider error messages. `provider_accepted` means Firebase accepted the
message, not that a phone displayed it.

- Explicit invalid/unregistered token errors clear only that driver's matching
  token. A newly rotated token cannot be cleared by an older failed request.
- Payload, authentication, project mismatch and APNs errors remain visible for
  diagnosis; they do not erase tokens or cause repeated retries.
- Explicit FCM server-unavailable/internal errors get at most one deferred retry
  after the SDK's own retry policy. Wait 60–75 seconds, honor a longer Retry-After,
  and abandon retries that require waiting more than two minutes. Ambiguous
  network errors and rate-limit errors do not get an application-level retry.
- Before retrying, confirm the order is still DISPATCHED to the same active,
  online driver with the same token and that the app is not foregrounded.
- Android notification tags and APNs collapse IDs use the order ID; notifications
  expire after two minutes. The existing data type/orderNumber contract remains.
- Retries are best-effort in-process timers, cancelled on shutdown. They are not
  a durable queue and do not survive a restart. The existing driver app order
  polling remains the fallback for assignment alerts. Exactly-once device delivery
  is not claimed.

## Health checks

`GET /api/v1/health` and `/api/v1/health/ready` return HTTP 200 only when a
side-effect-free `SELECT 1` succeeds; otherwise they return 503 with a generic
database unavailable/timeout result. Responses are not publicly cached. Local
probe results are reused for two seconds and concurrent probes share one query.
HTTP checks time out after two seconds. A query which is still settling remains
shared, so a failed pool does not accumulate an unbounded queue of health queries.

`GET /api/v1/health/live` only checks the web process and is for diagnosis. It must
not be substituted for the readiness check in outage monitoring. `API_READINESS`
logs appear on state changes, without underlying database error details.

Render production configuration after deployment:

- Workspace: Speedy's workspace (`tea-d7loaul7vvec73cme5d0`).
- API service: `srv-d7ntlnpkh4rs73bev9q0`.
- HTTP health-check path: `/api/v1/health/ready`.
- Existing hourly `Monitor Production Health` task should check readiness and
  the Dispatcher page, confirm a failed read once, and report confirmed failures.
  This hourly check complements Render's frequent instance checks; it is not an
  instant outage guarantee. Healthy runs should stay quiet.

## Request diagnosis and rollout

Production HTTP logs use generated request IDs and declared route templates.
Never add real paths, query strings, Authorization headers or params to logs:
tracking paths contain bearer credentials. Unexpected 5xx middleware errors emit
`HTTP_SERVER_ERROR` using the same request ID and a safe code.

No database migration, new secret or new paid service is required. Rollback is
the prior production commit, `7ff3dd3385d2d87f55abd09d34c98b8a86502cab`;
if rolling back, restore Render's previous health-check path because the old
version does not expose `/health/ready`. Configure readiness only after the new
endpoint is live. Watch the exact deployed commit, both readiness and liveness,
and runtime logs after release. A real-driver foreground/background delivery
check remains separate from mocked tests and HTTP smoke checks.

The eight previously observed failed push attempts logged only `Error`; their
historical causes cannot be reconstructed. New provider codes can distinguish a
device registration problem from APNs credentials, project mismatch or a provider
outage. Do not claim the historic failure cause is fixed without that evidence.

## Release validation

Local backend checks passed (411 tests, two database-only tests skipped locally)
and dispatcher checks passed (63 tests plus build); Prisma formatting passed.
GitHub CI also runs the two database checks against isolated PostgreSQL.
Dependency lockfiles are unchanged. The required npm audits report existing
advisories (nine backend, ten dispatcher), including transitive dependencies and
development tooling. Those need a separate dependency-maintenance review; this
release does not claim a clean dependency audit or change the dependency tree.
