# Order-flow diagnostics — first phase

This backend change emits structured JSON records to the existing Render API
application log. It connects the server-side order flow across website,
dispatcher, Android and iOS requests. It does not add a public log endpoint,
change dispatch decisions, send extra notifications, or require a paid service,
new secret, environment setting, database migration or dispatcher deployment.

## Reading an incident

Use authorized Render API service log access for `srv-d7ntlnpkh4rs73bev9q0`.
Filter application logs over the incident time range for `"orderNumber":1234`
(replace with the actual internal numeric order number). Include all levels;
normal decisions and provider acceptances are informational, holds/rejections
are warnings, failures are errors. JSON is compact, one event per line.

Start at `ORDER_CREATE` / `committed`, then follow `AUTO_DISPATCH`,
`DRIVER_ASSIGNMENT_PUSH`, `DRIVER_ACTION`, `RECEIPT_SAVE` and `CUSTOMER_ORDER_PUSH`.
Match the generated `requestId` to find HTTP failures or earlier creation steps
that occurred before an order number existed. For failed creation without a
number, use time/route and the response's `X-Request-ID`; cross-origin clients can
read that header. No client changes or automatic ID capture are included here.
Later driver requests have different request IDs but the same order number.
Deferred driver notification attempts retain the original request ID and their
own stable random `correlationId`.

| Event | Evidence provided |
| --- | --- |
| `ORDER_CREATE` | Started, business-closed rejection, or order committed. A committed record followed by HTTP failure means a later step failed; do not assume the order was rolled back. |
| `AUTO_DISPATCH` | Each allocation result and attempt number, including successful assignment, disabled setting, missing verified address, missing fresh GPS, routing failure/no route, changed order/location, retry limit and allocation failure. Eligible-driver count and priority driver's active-call count are included when evaluated. |
| `MANUAL_ASSIGNMENT` | Saved assignment/unassignment, or same-driver replay. |
| `DRIVER_ACTION` | Acceptance, pickup and delivery requests, successful writes, rejected transitions/ownership and replayed delivery confirmations. |
| `RECEIPT_SAVE` | Committed receipt, including whether it advanced the order to out for delivery. |
| `DRIVER_ASSIGNMENT_PUSH` | Provider accepted, explicit skip, safe provider failure code, cleanup outcome, retry scheduled/skipped and retry result. |
| `CUSTOMER_ORDER_PUSH` | Provider accepted, safe failure/cleanup code, or skip reason such as no token, erased order, wrong status or expired event. Includes notification type. |
| `HTTP_REQUEST_FAILED` | Finished HTTP responses with status 400 or above, including direct controller/middleware rejections, safe declared route, request ID and elapsed time. |
| `HTTP_SERVER_ERROR` | Error-handler 5xx exceptions with a safe provider/Prisma code or `unclassified`. |

`held` is an allocation outcome, not proof of a software exception.
`PRIORITY_CAP_REACHED` may accompany a successful fallback assignment.
`provider_accepted` is not proof a device displayed or a person read a message.
`committed` is emitted after the database write/transaction returns, before
notification or readback work; transaction rollback never produces that success
record. Delivery retries use `replayed` and retain existing idempotency behavior.

## Data and volume boundaries

The shared schema accepts only known events, outcomes, reasons and notification
types, safe numeric counters, generated IDs and allowlisted error codes. It
includes an ISO timestamp, schema version, service, and Render's commit SHA when
present and valid. It does not include customer/driver names, phone numbers,
email, street addresses, item lists, GPS coordinates, payment details, device
or tracking tokens, order UUIDs, request/response bodies, raw SDK errors or stack
traces. The old pickup advisory now uses the order number rather than order UUID.
Only declared route templates are supplied, never actual URLs or query strings.
Unrecognized codes become `unclassified`; diagnosis may still require code review.

The number of flow records is bounded by existing order actions and retry limits.
The new HTTP event covers failed responses only, avoiding a second success record
for each routine poll. Existing HTTP/access logs remain. Logs are accessible only
through existing authorized hosting access, and follow that service's configured
retention and limits. This is not a durable audit ledger or a guaranteed long-term
archive. Sink errors do not fail order handling. No log export, new storage policy,
customer-facing screen, alert destination or recurring monitor is configured.

## Scope still outstanding

This first phase covers the backend paths above, including requests from all
clients. It does not yet collect browser JavaScript exceptions, native Android/iOS
crashes, offline failures that never reach the API, every background job or every
external integration. Client crashes, interrupted requests or process termination
can leave a started action with no terminal event; absence of a log is not proof
that an operation never happened. Log collection also cannot reconstruct past
incidents before this release. Future phases should apply the same schema and
privacy rules, define retention/volume budgets, and add tested alerts for stalled
orders or repeated failures.

## Verification and rollout

Tests cover concurrent request isolation, HTTP correlation and URL redaction,
allowlisted metadata, logging-sink failures, deferred notification correlation,
notification skip/provider/cleanup outcomes, held allocation reasons and bounded
retries, committed lifecycle events, and absence of delivery success on rollback.
Existing order, concurrency, receipt, loyalty and push tests must continue to pass.
No live orders or push notifications are used for validation.

Reviewed help articles: `manual-order`, `driver-assignment`, `auto-dispatch`,
`order-lifecycle`. Staff-visible instructions are unchanged. Example questions:
"Why is this order still unassigned?", "How do I assign a driver?", and
"Did the delivery save if the app lost its confirmation?"

Merge/deploy require the repository's explicit release approval and passing CI
on the exact commit. Main and the focused production release currently differ;
reconcile that gap before selecting a deploy SHA rather than deploying all of
main accidentally. After release, confirm exact SHA, readiness/liveness, startup
logs and ordinary incoming flow events. Rollback to the immediately previous
healthy production SHA requires no schema rollback. Confirm real phone display
and app-crash collection separately; unit tests do not demonstrate either.
