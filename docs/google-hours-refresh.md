# Google opening-hours request limits

Speedy Sweeties fetches its Google Places schedule once per daily slot, beginning
at 03:00 America/Toronto (including DST). A normal-server timer checks the saved
slot every 30 seconds; that check is local database work, not a Google call.
A missed slot or empty cache is populated once on startup. Initial installation
can therefore make one bootstrap request outside 03:00. The next refresh is 03:00.
Public `/business/status`, order submission and ChatGPT ordering only read the
saved schedule. They calculate open/closed and next opening against Toronto time;
they never reuse yesterday's `openNow` boolean and never fetch Google themselves.
No website or app release or manual refresh button is needed.

Existing `SystemSetting` rows hold the schedule and last claimed daily slot,
scoped to the configured place ID. The attempt is atomically committed before
provider I/O, so concurrent instances, restarts and failed requests do not spend
again in the same slot. A failed refresh retains the last good schedule, emits a
sanitized error and retries next daily slot. Dated current hours expire after the
fetch date plus six days; regular hours then supply the stale fallback. The API
adds `hoursUpdatedAt` and `hoursStale` while preserving existing response fields
and the `google_places` source used by current apps and order validation. With no
usable saved schedule, the previous unconfirmed fallback policy remains unchanged.

Active pickup stores fetch regular and current hours together at most once every
seven elapsed days per store. An hourly local due-date scan and startup scan do not
call Google for stores checked within the last seven days. `hoursLastCheckedAt`
is atomically claimed before lookup, also limiting failed/unknown-place retries
and the existing staff refresh API. Legacy regular/current force flags no longer
bypass the weekly cap. `Refresh Locations` still only reloads saved records. New
stores and deliberately changed store identities can initialize a fresh schedule.
The Clair Beer Store's stricter match check is preserved inside its weekly claim;
there is no separate Google lookup on every startup.

Consequences: same-day Google edits wait until the next scheduled refresh; failed
pickup refreshes keep existing hours for the week. No new schema migration, npm
dependency, environment variable, paid service or dispatcher UI control is added.

Validation: mocked-provider tests cover repeated customer reads, concurrent
claims/restarts, provider/storage failures, daily boundaries through both DST
transitions, opening/closing, overnight and split hours, dated holiday closures,
24/7 periods and stale dated-hours fallback. Pickup tests cover combined weekly
updates and failure/force/concurrency caps. Startup tests keep the new monitor
out of quiescent mode.

Release: backend-only, after normal review/CI and merge approval. No production
setting changes. Verify daily refresh log, then repeated read-only status requests
with stable `hoursUpdatedAt`, and unchanged live/ready endpoints. Do not force
Google requests to test the cap in production. Rollback is the previous backend
commit; cache rows may remain and do not affect old code.
