# Final receipt lock — November 26, 2026

A valid receipt-save request after DELIVERED or CANCELLED returns HTTP 409
`FINAL_RECEIPT_LOCKED`. It neither creates a missing receipt nor overwrites an
existing receipt, including its amounts, notes, item fingerprint and updatedAt.
Retries receive the same refusal. Assigned-driver ownership is checked first.

The controller checks final status while holding the Order row lock, before any
receipt write. A concurrent delivery/cancellation that commits first is observed
when the waiting save acquires the lock. If a save acquires the lock first, it
finishes before the terminal transition can commit. Ordinary active-order receipt
behavior is unchanged. Existing receipt viewing remains available.

Both mounted route definitions allow only DRIVER receipt writes. Their role
permissions remain unchanged. The controller's existing staff branch also takes
the row lock and rejects final orders as defense in depth; this does not grant
staff receipt-write access or add a correction override. No separate audited
correction flow is introduced. Privacy processing retains its existing behavior.

This change is stacked on PR166, `fix/receipt-draft-integrity-2026-11-26`, at
1d41ab11da5e59496ef2620ec32286467f1bb8e2. This follow-up introduces no migration,
configuration, dependency or mobile change; PR166's additive receipt fingerprint
migration remains a deployment prerequisite for the combined code. Source and
help changes require an API release. No merge or deployment is included here.

Validation covers existing/missing receipts for both terminal statuses, all three
controller roles, repeated requests, unchanged active staff-controller behavior,
assignment and missing-order responses. The opt-in isolated PostgreSQL test
observes actual lock blocking, then verifies refusal after delivery/cancellation
commits for every controller role, with byte-equivalent saved receipt fields.
This database test runs in the existing privacy-database CI job.

Help article: receipts. Example questions: "Can I change a receipt after delivery?"
and "What happens if a driver's receipt save arrives after cancellation?"

Local checks passed: 677 backend tests (17 opt-in DB/cloud checks skipped),
TypeScript build, Prisma generation/validation/format, dispatcher lint/build and
86 tests, dispatcher-help gate, both dependency audits (zero findings), and
whitespace/changed-file credential checks. Actual PostgreSQL results are recorded
in the pull request after its CI run.
