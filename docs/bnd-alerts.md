# B&D waiting-call alerts

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
  account-scoped order list, normally once per 60 seconds after each check.
- Each browser reads the backend's cached status every 10 seconds; extra tabs
  do not increase B&D requests within one backend process.
- Existing unclaimed calls also alert on initial load, refresh and server restart.
- The pop-up stays visible and sound repeats every 10 seconds until a successful
  B&D refresh clears the call. There is no Acknowledge action that could hide a
  still-unclaimed call. Allow roughly 60–90 seconds for normal detection/clearing.
- B&D Alerts ON/OFF is a per-browser preference for pop-ups/sound. The server
  keeps checking while the browser switch is off. Re-enabling resumes reminders.
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

Only `POST https://api.bddeliveries.ca/api/account/login` and
`GET https://api.bddeliveries.ca/api/driver/order` are used. Redirects are rejected.
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
