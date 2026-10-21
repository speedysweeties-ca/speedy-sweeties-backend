# Dispatcher editing allowance

Opening Edit Order before first dispatch starts a server-timed pause. Save,
cancel, leaving Live Orders, hiding/closing the tab, and logout stop it. The
visible editor renews every 15 seconds; a missing close request expires after
45 seconds without renewal. Expired sessions cannot credit the disconnected gap.
If the pause cannot be confirmed, the editor displays a connection warning.

Only creation-to-first-dispatch editing is deducted. Existing elapsed waiting
is retained, multiple editors' overlapping intervals count once, and editing
after dispatch does not change dispatch performance. Order creation/delivery
timestamps and the 40-minute delivery goal remain unchanged. Older orders with
no recorded editing intervals retain their original timing.

`OrderEditPause` stores server timestamps and the authenticated actor. Session
IDs are per visible editor lifecycle. Start/heartbeat/stop are staff-only and
serialized on the order row; a stop arriving first creates a zero-duration
closed session. Another actor cannot renew or close that session.

The Dispatcher Performance page and over-five-minutes filter deduct the union
of editing intervals clipped to first assignment. The live acceptance warning
and undispatched email also deduct the same pre-dispatch editing allowance.
The weekly SQL email must subtract
`dispatch_edit_pause_duration(order_id, created_at, first_dispatched_at)` from
the raw dispatch interval before its strict `> INTERVAL '5 minutes'` comparison.
Keep the existing reporting dates and first-assignment attribution.

Deployment: apply the additive migration before running the updated backend.
The dispatcher handles the rolling backend/frontend deployment: a temporarily old backend
returns an error to the editor's new endpoint, which displays the pause warning
without preventing editing. Verify the migration and update the weekly task's
query before reporting the feature live.

Verification covers overlapping sessions, expired leases, stop/start reordering,
actor ownership, exact-five-minute boundaries, first-assignment clipping, and
unchanged delivery time. CI runs the migration and real session mutations on an
isolated PostgreSQL service, never the production database.

The CI database uses a pre-feature baseline built from the checked-in schema,
then applies this feature's migration verbatim. Historical migrations alone do
not recreate all existing production columns (including Order.dispatchedAt), so
this test does not claim to repair or certify that older migration history.
