# Receipt item snapshot — November 26, 2026

Updated driver apps send `expectedItems: [{ id, name, quantity }]` with receipt
amounts. This is the snapshot actually used to price the receipt, captured before
submission; it must not be rebuilt from a newer order after totals were computed.
The API checks the snapshot under the assigned order's existing row lock, before
receipt upsert or pickup transition. A changed item set/name/quantity returns
409 `RECEIPT_ITEMS_CHANGED`, with no receipt write or notification. Malformed,
duplicate-ID or invalid-quantity snapshots return 400 `INVALID_RECEIPT_ITEMS`.
Display ordering is irrelevant. Dispatcher item replacement takes that same lock
before related writes and rechecks final status after waiting.

The field is optional for installed legacy clients during rollout. Updated apps
always send it. Deploy this API before distributing the updated Android/iPhone
apps. The new app logic removes obsolete prices and requires review; the backend
check closes the interval between the last refresh and receipt submission.
Legacy app submissions without the snapshot still use the prior behavior and
are not protected by the new stale-item guard. Apply the additive migration
`20261127035000_receipt_items_fingerprint` before deploying this API. It adds one
nullable DigitalReceipt.itemsFingerprint column; no environment change.

Receipts saved with a verified snapshot store its SHA-256 fingerprint. The driver
order response reports receiptItemsCurrent by comparing that fingerprint to the
current items. Reopening a mismatched or legacy/unverified receipt clears its
editable merchandise aggregate and requires price review, while retaining saved
delivery extras. Old receipts are not silently stamped as verified. No old
financial amounts are rewritten by this migration. Old application code can
ignore the new column on rollback; do not drop it as part of rollback.

Scope: removed/replaced draft prices and Driver iOS fee restoration. This does
not change loyalty, card surcharge, rates, payment collection, or backfill old
receipts. A receipt validly saved before a later dispatch edit is still a saved
historical amount until the driver reviews and updates it; the updated apps do
not reuse that merchandise amount after the item fingerprint changes. This
patch does not delete financial history or introduce a final-receipt correction
policy.

Validation: root check/build/Prisma validation, 660 passing tests (17 opt-in
DB/cloud checks skipped locally), dispatcher lint/build and 86 passing tests,
Prisma format, help review, both dependency audits (zero findings), whitespace
and changed-file credential checks. The new receipt controller tests verify
changed items observed after acquiring the lock, reordered equivalent items,
malformed snapshots, no-write/no-notification rejection and unchanged legacy
requests. Actual isolated-database CI is separate from mocked controller tests.

Help articles: receipts, edit-order. Example questions: "Why did Review item
prices appear?" and "Will changing an item price remove the distance charge?"

App bases are the audit source branches, not store release branches. Android:
`audit/driver-local-source-2026-11-26` at 7bed1df. iOS:
`feature/driver-delivery-history-device-validation` at 27485af.
Mac iOS compilation and physical-phone acceptance remain pending. No merge,
production deployment, Play release or TestFlight/App Store upload performed.
