# Speedy Sweeties Dispatcher

Internal web application for live order dispatch, driver management, routing,
pickup locations, catalog operations, customer retention, and operational
checklists.

## Incoming-order alarm

- **Alarm: ON/OFF** sits beside Auto Dispatch. It defaults to ON and remembers
  the preference in this browser's local storage; it does not change Auto Dispatch.
- Use **Enable Sound** or **Test Alarm** after opening the dispatcher to activate
  browser audio. The test creates only a local notification, never an order.
- After the first successful order load establishes a quiet baseline, new
  customer orders trigger a persistent red notification and a three-tone chime.
  Sound repeats every 10 seconds until **Acknowledge**, Alarm OFF, logout, or all
  alerted orders leave the active list. **View Orders** opens Live Orders without
  acknowledging or assigning an order. Multiple arrivals share one notification.
- Android, iOS, website, and unknown/future customer sources are included.
  The current ChatGPT gateway is included through `UNKNOWN`; it is labelled
  **Customer order** because that source is not exclusive to ChatGPT.
  `DISPATCHER_MANUAL` and orders with `createdByUserId` are excluded, regardless
  of which dispatcher created them. Auto-assigned customer orders still alert.
- Order checks continue every five seconds across dispatcher tabs, even while
  page refresh is paused for editing. Background checks do not overwrite forms
  or driver selections. Failed checks show an inline connection warning and
  retry automatically. Returning to the browser tab also triggers a check.
- Acknowledged orders and orders observed while OFF do not replay when refreshed
  or re-enabled. The initial active list after a reload is also a quiet baseline.
- Keep the dispatcher open, the device awake, and the tab/speakers unmuted.
  Browser throttling, sleep, a closed tab, or loss of connectivity can delay or
  prevent alarms. This is a page alarm, not an operating-system push service.

No backend/schema changes, migrations, new dependencies, or environment
variables are required for the alarm.

## Local development

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local`.
3. Set `VITE_API_BASE_URL` to the backend you intend to use.
4. Set `VITE_GOOGLE_MAPS_API_KEY` to a browser-restricted development key.
5. Start the app with `npm run dev`.

Both `VITE_` values are included in the browser bundle. Never put server
credentials or unrestricted API keys in them.

## Required checks

Run the complete dispatcher gate before opening or merging a pull request:

```bash
npm run check
```

This runs ESLint, the dispatcher unit tests, the TypeScript compiler, and the
production Vite build. The repository GitHub Actions workflow runs the same
gate for pushes and pull requests.

## Release behavior

The dispatcher is deployed from the repository's `main` branch by the
configured hosting service. A successful local build is not a deployment.
Follow the repository release checklist for approval, production verification,
and rollback requirements.

The Google Maps integration loads the Maps JavaScript API in the browser and
contains a narrow ESLint exception for that dynamic SDK boundary. The current
large components are not compiled with React Compiler; compiler-only hook rules
are disabled only where the legacy component structure requires it.
