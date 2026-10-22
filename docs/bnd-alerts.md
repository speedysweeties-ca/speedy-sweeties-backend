# B&D waiting-call alerts

## Weekly timing history (October 22, 2026)

The successful list checks now also save a small timing history, independently
of the desktop and immediate-email switches. Apply migration
`20261022170000_bnd_waiting_history` before starting the updated backend.
It adds `BndMonitorCheck` and `BndWaitingPeriod`; existing B&D response and
Speedy order/customer schemas are unchanged. No new credentials or frontend
deployment are required. Existing history before this rollout cannot be recovered
from email receipts and must not be inferred.

- `firstSeenAt` is when our monitor first observes a waiting order, not B&D's
  exact order creation time. No customer details are retained.
- A successful check explicitly returning `is_en_route=true/1` records
  `endReason=CLAIMED` and the observation time. The B&D app claims an order when
  its detail page opens. This does not identify the person using the shared
  account or prove a screenshot was sent to a driver.
- An absent order ends a period as `MISSING`, never as an inferred opening.
- Only another positive waiting observation strictly more than five minutes
  after the period started records `overFiveMinutesAt`. An opening detected at
  5m30s with the last waiting observation at 5m does not qualify. This conservative
  rule avoids blaming staff for the normal polling delay; some borderline late
  openings cannot be proven and will not be reported.
- Gaps longer than two minutes start a new waiting period on the next positive
  observation. Outages and overnight pauses are not charged as waiting time.
  Previously confirmed overdue observations remain available. Claims observed
  after a gap can still be recorded, but do not retroactively create an overdue
  event. Times are approximate observations: checks run every 60 seconds with
  no waiting orders and every 10 seconds while any order is waiting.
- A database transaction/advisory lock and timestamp ordering handle restarts,
  duplicate snapshots and overlapping deploys. History failure is logged and
  rolls back the entire check without suppressing the existing alerts.

Use `docs/bnd-weekly-report.sql` for the weekly email. It returns each order once,
scoped by first observed waiting time to Monday 00:00 through Sunday 18:00 Toronto,
and only uses overdue/opening observations before the cutoff. Unconfirmed opening
times must say **Not confirmed**, not **Still waiting**. The confirmed waiting
duration is a lower bound, not the exact time to open. Use
`docs/bnd-weekly-coverage.sql` to disclose incomplete history and daytime gaps over
120 seconds during expected opening hours. Daily published hours are saved in
`SystemSetting` under `bndHours:YYYY-MM-DD`. A published closed day expects no checks.
Dates before this rollout retain the legacy 10am–9pm window. Cached/fallback
hours must be disclosed; no checks during an expected opening window is unavailable
history, never proof of zero late orders.
Keep this section separate from dispatcher-attributed Speedy performance.

The first weekly email will have partial history from rollout onward. Render
runs the additive migration in pre-deploy. Rolling back application code leaves
these independent tables safely in place. Automated tests use the isolated CI
PostgreSQL database and never claim real B&D calls or send emails.

This feature monitors the shared B&D account and displays an audio/visual reminder
on every signed-in staff dispatch page. It does not create Speedy orders, import
customer details, claim B&D calls, open their details, or send screenshots/texts.
The existing screenshot-and-text workflow stays with the dispatcher.

## Meaning of received

The supplied BDD Dispatcher 1.0.0 APK reads `is_en_route` to distinguish Claim
from View Order. Opening its detail page sends a claim request. We treat a call
as received when a successful list refresh reports it claimed, or when it is no
longer in that list. This does not prove a screenshot was sent to a driver.

## Monitoring and reminders

- The backend signs in via the APK's existing login flow and reads the same
  account-scoped order list every 60 seconds when no orders are waiting. A valid
  snapshot with any waiting order switches the next checks to every 10 seconds.
  Fast checks continue until all waiting orders are claimed or disappear from a
  successful list refresh, then the next check returns to 60 seconds. Opening one
  of several waiting orders does not slow the checks while others remain.
  Error backoff and B&D Retry-After limits override the faster schedule.
- Each browser reads the backend's cached status every 10 seconds; extra tabs
  do not increase B&D requests within one backend process.
- Both checks follow the public hours feed used by https://www.bddeliveries.ca/:
  `GET https://api.bddeliveries.ca/api/hours`. The backend fetches this small,
  unauthenticated JSON at startup, Toronto midnight, and that day's opening.
  Daily `today_hours` / `closed_all_day` overrides regular weekday hours, including
  published holiday closures. Unexpected changes after opening are picked up on
  the next scheduled refresh or restart, not continuously.
- Verified regular hours on October 22, 2026: Mon–Wed 9:30am–8pm, Thu–Sat
  9:30am–9pm, Sunday 11:30am–5pm, Toronto time. Both the 60-second idle checks
  and 10-second waiting checks stop at closing. Local timers handle DST.
- The last validated calendar is persisted in `SystemSetting.bndBusinessHoursCache`.
  A feed failure retains those hours (or the verified regular hours on first use),
  labels them as saved hours in Dispatcher, logs a warning, and retries in 15 minutes.
  An old daily holiday override never carries into another date.
- Browsers read the small authenticated `/api/v1/bnd-alerts/hours` cache on load
  and when it is due for refresh; this endpoint never contacts B&D. The full
  calendar is not added to the frequent status response. Status and admin-settings
  polling pauses outside the daily window; no backend order requests run overnight.
- Dispatcher shows the overnight pause and retains any last-known waiting calls
  without repeating alarms overnight. A fresh daytime check resumes reminders.
  The email monitor also skips its database/provider work while paused. Existing
  upstream retry deadlines are still respected if they extend past reopening.
- Admin email settings load once when the control mounts and remain editable
  overnight; their recurring 30-second background refresh also pauses overnight.
- The backend schedule in `src/integrations/bnd/schedule.ts` is mirrored in
  `speedy-dispatcher/src/bndSchedule.ts` for Render's isolated frontend build.
  A test enforces parity. No cron service, environment changes, or migrations are needed.
  Refresh existing dispatcher tabs after deployment to pick up the browser pause.
- Existing unclaimed calls also alert on initial load, refresh and server restart.
- The pop-up stays visible and sound repeats every 10 seconds until a successful
  B&D refresh clears the call. There is no Acknowledge action that could hide a
  still-unclaimed call. New calls may take roughly 60–90 seconds to appear from
  an idle queue. Once a call is detected, opening/claiming is normally detected
  on the next 10-second upstream check, plus up to 10 seconds for the browser
  status refresh and network time.
- B&D Alerts ON/OFF controls pop-ups/sound for the current session and resets ON
  at login. The server keeps checking during monitoring hours while the browser
  switch is off. Re-enabling resumes reminders during those hours.
- Browsers require a user interaction to enable audio. Keep Dispatcher open on
  an awake dispatch computer. Sleeping/closed browsers cannot provide alarms.
- Failures retain last-known waiting calls and visibly mark monitoring interrupted.
  An outage never means an empty queue. Invalid schemas are treated as errors.
- Requests time out after 15 seconds; failures back off to at most 15 minutes,
  or longer if B&D returns Retry-After. Rejected logins retry after 15 minutes.
- The existing incoming Speedy alarm is independent. Both pop-ups stack rather
  than covering each other. There are no database migrations or new dependencies.

## Secure setup and rollout

Static APK inspection confirmed the request paths and field names. A real
authenticated B&D response and shared-session behavior still need verification.

1. Deploy the reviewed change with `BND_MONITOR_ENABLED=false` initially.
2. Privately add `BND_LOGIN_EMAIL` and `BND_LOGIN_PASSWORD` to the **backend**
   Render service's environment. Never put them in chat, source, VITE variables,
   the frontend, request URLs, or logs. Preserve the password exactly.
3. Enable `BND_MONITOR_ENABLED=true` and restart the backend. Use a single backend
   instance for this monitor. Each instance would otherwise poll independently;
   horizontal scaling needs a shared cache/lease or a dedicated monitor worker.
4. Sign in to Dispatcher and enable sound. Verify B&D connected and compare the
   waiting count with the B&D list. Do not open B&D order details just to inspect
   them: that action claims the call.
5. During an ordinary incoming call, verify repeated reminders and that opening/
   claiming the call through the normal B&D workflow clears the alert on the next
   successful check. Confirm existing B&D sessions remain signed in.
6. Check both alarms together, the B&D switch, and connection-loss/recovery.
   Confirm no Speedy order, assignment, message, or delivery-history record is made.

`POST https://api.bddeliveries.ca/api/account/login`,
`GET https://api.bddeliveries.ca/api/driver/order`, and the public
`GET https://api.bddeliveries.ca/api/hours` are used. Redirects are rejected.
The session token is held in backend memory. Credentials and raw order responses
are never returned to browsers or logged. The staff-only endpoint
`GET /api/v1/bnd-alerts/status` exposes only monitoring health and pending IDs/numbers.

To stop upstream monitoring, set `BND_MONITOR_ENABLED=false` and restart. Before
deployment, rollback is the prior main commit; no database rollback is necessary.

## Admin email notifications

- The **B&D Emails** toggle sits alongside B&D Alerts and is shown only to ADMIN
  accounts. Both GET and PUT `/api/v1/bnd-alerts/email-settings` also require a
  currently active admin on the server, including when an old token says ADMIN.
- It defaults **OFF**. Turning it ON saves a shared system setting and sends to
  **rstubbings@hotmail.com** only. Dispatchers cannot read/change this setting or
  change the recipient. Closing Dispatcher or switching off desktop B&D Alerts
  does not stop emails; use the admin email toggle to stop future sends.
- The existing B&D monitor's next fresh snapshot is checked for waiting calls.
  Normal detection remains roughly 60–90 seconds, plus email-provider delivery
  time. Enabling also emails any currently waiting call that has not been emailed.
  Calls that arrive and are claimed between B&D polls cannot be detected.
- One email per B&D order ID contains its number and a reminder to check B&D.
  No customer details, screenshots, claiming, or Speedy order creation is involved.
  The email service reuses `RESEND_API_KEY` and `UNDISPATCHED_ALERT_FROM`, with a
  fixed recipient independent of other email settings. Missing email setup is
  shown in the admin control and blocks enabling, but never blocks disabling.
- The additive `20261005160000_bnd_email_alerts` migration creates `BndEmailAlert`
  receipts. Run `npx prisma migrate deploy` before starting the new backend, then
  deploy Dispatcher. No new environment variables or dependencies are required.
- Durable receipts and atomic claims protect repeated checks, restarts, and
  overlapping processes. Keep receipts to preserve deduplication. Failed sends
  retry after two minutes while the call is still waiting and monitoring is fresh.
  A send already in progress when OFF is saved may still arrive.
- Each retry uses the same Resend idempotency key and stored order number.
  [Resend retains keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys),
  so automatic retries stop 23 hours after the receipt is created. This prevents
  duplicate delivery after an ambiguous provider timeout beyond that window.
  Provider acceptance does not establish inbox delivery; check the provider for
  failures, bounces or expired unconfirmed sends. Errors are logged without raw
  provider responses or customer data. Email failures do not affect B&D monitoring.
- Rollback: turn B&D Emails OFF, then revert application code if necessary. The
  additive receipt table can remain. The original desktop alerts remain independent.

Verification before enabling: backend and dispatcher checks; apply migration;
confirm admin-only visibility and on/off persistence; then verify one real waiting
call produces one email and no repeat after a refresh/restart. Offline tests use
fake emails and never contact B&D or send a real message.

## Bandwidth estimate for published hours

The prior daily 10am–9pm window was 77 hours/week. Published regular hours total
71.5 hours/week: 5.5 fewer hours (7.14%), or 330 fewer idle order checks/week
(about 1,430/month). Roughly 14 small public-hours reads/week partly offset this.
A continuously open dispatcher tab also makes about 1,980 fewer cached status
requests/week, and an admin tab 660 fewer email-settings requests/week.
Actual byte savings depend on payload/header sizes, open tabs, and waiting orders.
At an illustrative 1KB outbound per exchange, that is about 1.4MB/month for
backend requests plus 8.6MB/month per dispatcher tab (2.9MB extra for an admin).
This is not a measured saving or 7.14% of the whole service's bandwidth. Render
bills outbound public traffic; incoming B&D response bodies are not billable
outbound. https://render.com/docs/outbound-bandwidth
