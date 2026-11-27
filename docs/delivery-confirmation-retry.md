# Delivery confirmation — November 26, 2026

When the same assigned driver repeats DELIVERED for an already delivered order,
the API returns 200, success=true, the exact saved order and alreadyCompleted=true.
It does not update timestamps, receipt fields, loyalty or notification state.
The response shape is compatible with installed clients; the extra flag is additive.

A new completion locks the Order row and checks assignment/status/receipt there.
It saves the completion and the existing eligible loyalty credit in one transaction.
If credit fails, delivery rolls back too. Concurrent retries serialize and only
one request earns credit. Cancelled/missing/reassigned orders are never acknowledged
as completed for the requesting driver. Pricing, eligibility and card-surcharge
policy are unchanged; no historical loyalty backfill is attempted.

Customer notification is best effort after commit. A failed notification attempt
cannot turn a saved delivery into a failed action. Replay does not send again.
A process exit between commit and notification can still miss that notification;
this change does not introduce a durable outbox or promise push delivery.

Updated Android/iOS apps make at most one application-level retry after a transport
failure or HTTP 5xx, using the same order/session. They require success=true and
that exact order's DELIVERED status, not an empty active list. Exhausted retries
show an unknown-result message and direct the driver to retry/check with dispatch.
Android keeps acknowledged completion even when refreshing the list fails and
filters confirmed orders from stale lists within that session. Cancellation and
session changes must not deliver stale success callbacks.

Base: pending backend PR167 at 03726df9daa66810a54acf84aa1f1542b998db53. This
follow-up adds no migration, dependency or environment variable. The underlying
PR166 fingerprint migration remains required by the combined backend branch.
Deploy the API before distributing the companion driver app changes. Rolling
back this API removes replay acknowledgements, so coordinate rollback with apps.
No merge, deployment, store upload or production writes are included.

Local validation: 680 backend tests passed, 17 opt-in DB/cloud checks skipped in
that run; new isolated-database coverage runs in CI. Dispatcher lint/build and
86 tests passed; Prisma formatting/validation, help review, both dependency audits
(zero findings), whitespace and changed-file scans passed. The guarded synthetic
PostgreSQL tests cover eight concurrent completions, replay, credit rollback,
cancellation/reassignment races, missing receipts and notification failure.

Help article: order-lifecycle. Example questions: "Did Delivered save when the
phone lost signal?" and "Will pressing Delivered again add another loyalty credit?"

Physical-phone network interruption tests remain pending. iOS core tests and syntax
checks do not establish a full Xcode/simulator build; that verification needs a Mac.
