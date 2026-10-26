# Release Checklist

Use this checklist for backend or dispatcher changes. Mobile app publication is
a separate release and requires its own signed build and store submission.

## Before opening the pull request

- Confirm the worktree contains only the intended release.
- Update the How do I…? articles alongside every dispatcher workflow change,
  including underlying backend behavior. Verify exact labels, roles, side
  effects, review dates, evidence and help navigation. Run
  `npm run check:dispatcher-help -- <base-ref>` and record affected guide IDs and
  example questions in the PR. See `AGENTS.md` and `docs/dispatcher-help.md`.
- Run `npm ci` and `npm run check` from the repository root.
- Run `npx prisma format --check` from the repository root.
- Run `npm ci` and `npm run check` from `speedy-dispatcher/`.
- Run `npm audit` in both directories and review every reported advisory.
- Confirm no production credentials, customer data, generated build output, or
  local environment files are included.
- Document any database migration, environment-variable, or rollout dependency
  in the pull request. State explicitly when there is none.

## Before merge and deployment

- Obtain explicit merge approval.
- Require the GitHub Actions checks to pass on the current commit.
- Reconfirm the production target and any required configuration.
- Identify the prior healthy commit so the code rollback target is known.
- Do not run destructive or production database commands as part of validation.

## Draft PR 93 isolated Twilio gate

Current production-deployment preparation (2026-10-26): integrated application
revision `4aa373e7a50c1f79c047a7fa7e9260be9a3c431f` passed both CI jobs in PR run
`40406476683` and push run `40406469607`. Main and production remain `7bcaaf7`.
Production health and pre-privacy schema were rechecked. Actual Recovery/PITR/export
availability and a completed non-production restore remain unverified. Follow the
exact configuration, separately costed restore exercise and no-order/no-message
smoke plan in `docs/privacy-technical-configuration.md`; historical isolated reset
evidence below is not a backup-restore pass. All four production gates must be false
for the separately approved deployment. No application tests are required locally
for this documentation-only update.

- Keep `speedy-api`, `speedy-sweeties-db`, `speedy-ordering-staging` and its database
  unchanged. Do not use either existing service as the privacy API test target.
- Require the current review-branch CI privacy job to pass serially against only
  `speedy_privacy_synthetic`, including the real-route mocked-delivery test.
- Follow `docs/privacy-isolated-twilio-test.md`. Provision the smallest paid database
  only after Robert approves the dashboard estimate; configure a new auto-deploy-off
  service with separate secrets and no production environment group.
- Before a live attempt, prepare one synthetic phone-only source order, show only the
  masked destination and obtain Robert's explicit authorization for exactly one SMS.
- Keep fulfillment and email disabled. Require the test client to prove fulfillment
  is rejected and data unchanged, then cancel the synthetic request.
- The authorized 2026-10-24 attempt reached the isolated challenge route at
  `13:19:28Z` but returned `VERIFICATION_DELIVERY_UNAVAILABLE`. Read-only Twilio
  diagnostics found valid credentials (`HTTP 200`), an active Full account and a
  Verify Service owned by that account, but no accepted Verification Attempt or
  Monitor Alert in `13:17Z`–`13:22Z`. The pre-diagnostic adapter did not retain the
  provider response, so its HTTP status/code remain unknown. Do not retry. The next
  owner check is Twilio Console > Verify > Settings > Geo permissions: confirm the
  Canada SMS setting and record its displayed state without changing it first.
- Robert's read-only Console inspection on 2026-10-24 confirmed Canada `SMS & RCS:
  Allow All Traffic` and `Voice: Disable All Traffic`; no setting was changed. Do
  not attribute the failed SMS attempt to Canada being disabled. The next diagnostic
  is a read-only inspection of Twilio Verify Logs and Monitor Error Logs for
  `2026-10-24 13:17Z` through `13:22Z`: record only whether a Verification exists,
  its provider HTTP status and numeric error code. Do not copy destinations, SIDs,
  OTPs, request/response bodies or trigger another verification.
- The follow-up Console inspection found zero Verify verifications and zero Blocked
  Verifications in the last 30 days, plus no US1 Monitor Debugger results in the
  last 24 hours. These are negative observations, not proof that the original HTTP
  request never reached Twilio: the adapter then in service did not retain the
  provider status/error or distinguish a rejection, malformed success, network
  failure, ten-second timeout, or failure in the post-send database update.
- Code-path review found no evidenced construction defect. The private client
  accepts a valid Canadian ten-digit number and normalizes it to E.164; the fixture
  stores the matching national digits; source-order/contact validation reconstructs
  the same `+1` destination; and the adapter uses the configured Verify Service
  `/Verifications` endpoint with Basic Account SID/Auth Token authentication and
  form-encoded `To` plus `Channel=sms`. Existing mocked adapter and real-route tests
  cover those transformations. The original cause is therefore unrecoverable. One
  separately authorized retry with the already-added sanitized instrumentation is
  required; do not send until the client again shows only the masked destination
  and Robert authorizes exactly one SMS.
- A 2026-10-24 reset audit reconfirmed the isolated identities before any database
  operation: service `srv-dbe3861srm7s73dgfe50` (`speedy-privacy-isolated`) and
  database `dpg-dbe37v59fdbs73961o3g-a` (`speedy-privacy-synthetic`, database name
  `speedy_privacy_synthetic`). Production `srv-d7ntlnpkh4rs73bev9q0` /
  `dpg-d7m33g2qqhas73f58hrg-a` and ordering staging
  `srv-davc147avr4c73bd7eig` / `dpg-davbqnhsrm7s73bd3uq0-a` are explicitly excluded.
  Existing tooling cannot safely reset the used fixture: the Render preparer exits
  when the schema is complete and only rebuilds an incomplete schema after proving
  all customer-bearing tables empty, while normal isolated-server startup requires
  zero Customer, Order and User rows and stores fixture identity only in process
  memory. The prior single-use fixture left synthetic rows after that process ended,
  and privacy request/audit tables add dependent and `ON DELETE RESTRICT` records.
  There is no existing reset command or authenticated reset route. Do not improvise
  table deletion, weaken the startup assertion or turn messaging routes back on;
  add reviewed, identity-guarded synthetic reset tooling only with separate owner
  authorization.
- Robert subsequently authorized that narrowly scoped reset tooling for the same
  service/database only. Before executing it, require the injected Render service
  ID/name, configured database resource ID, connection host, database name and user
  all to match the approved target. Require a complete schema and prove the only
  application rows are the exact single synthetic Customer, Order, User and
  failed-delivery PrivacyChallenge. Reject any changed marker, provider reference,
  completed challenge, privacy request, receipt or other populated application
  table before `DROP SCHEMA`. Keep the one-shot reset gate in the build-only test
  preparer, never the production server or a public route. After rebuilding, verify
  the pinned schema, all four protection triggers and zero application rows, then
  disable the reset gate before enabling the instrumented phone-only retry.
- Reset execution completed on 2026-10-24 against only those exact resources at
  commit `3cc6a3a1ae732ad8267e0300145c75b9784d4b69`. Diagnostics-only deploy
  `dep-dbef2tu7bikc73888eq0` verified the injected service identity, database
  resource/host/name/user, complete schema and exclusively synthetic row set before
  rebuilding: Customer=1, Order=1, User=1 and PrivacyChallenge=1, with every other
  application table empty. The rebuilt pinned baseline and four privacy migrations
  then passed required table/column checks, all four protection-trigger checks, and
  zero-row checks across 26 customer-bearing tables and every application table.
  No fixture value, destination, token, OTP or credential was logged or retained in
  this evidence.
- Retry deploy `dep-dbef3i0m7kps73dmn8f0` is live on the same commit with the reset
  gate disabled, diagnostics-only mode off, phone/deletion gates on, and email plus
  fulfillment gates off. Startup verified zero Customer, Order and User rows and an
  authenticated loopback request to the real preflight route returned ready=true,
  fixtureCreated=false, phone=true, email=false and fulfillment=false. External
  `GET /health` returned HTTP 200 with synthetic scope; unauthenticated preflight
  remained HTTP 404. Auto-deploy remains off. Production remained live at
  `12b78cc4780c96efa286c167c63ac1676dfc5dbb`, and ordering staging remained live at
  `203b39990f008de28f066caed0b4635e8c233317`. No SMS was sent.
- The first instrumented retry at `2026-10-24T19:19:10Z` was rejected by
  Twilio before a Verification was accepted: the sanitized adapter record is
  `outcome=rejected`, provider HTTP `403`, numeric code `21608`. The adapter did
  not receive a success response or provider reference, and the post-send
  database update was not reached. Preserve this as the provider evidence for
  that attempt; it was not a network/timeout, malformed-success or post-send
  database failure.
- Robert confirmed on 2026-10-24 that the intended test destination ending
  `8097` is successfully verified under Twilio Verified Caller IDs. This is an
  owner-observed test-account configuration fact, not evidence of a new
  delivery. No credential, Geo Permission or application change was made. A
  fresh guarded synthetic fixture and separate authorization at the masked
  `SEND ONE SMS` prompt are still required before exactly one further attempt.
- After that confirmation, guarded reset deploy `dep-dbege71srm7s73c2odq0`
  independently reverified the exact authorized service/database identity and
  refused to proceed until it proved the failed fixture contained only one
  synthetic Customer, Order, User and PrivacyChallenge, with every other
  application table empty. It rebuilt the pinned baseline and privacy migrations,
  verified all protection triggers and zero rows, and exposed no destination or
  secret. Retry-ready deploy `dep-dbegf62vcj2c73csjm7g` is live at
  `e1ec40870e03e8c2785e56567df39f501fd157a1` with reset disabled, phone/deletion
  enabled, email/fulfillment disabled and auto-deploy off. Authenticated loopback
  preflight reported ready with no fixture or message created; external health was
  HTTP 200 and unauthenticated preflight remained HTTP 404. Production and ordering
  staging remained on `12b78cc4780c96efa286c167c63ac1676dfc5dbb` and
  `203b39990f008de28f066caed0b4635e8c233317`, respectively. No SMS was sent.
- Before the authorized reset, the read-only check found the isolated database
  available and diagnostics deployment `f1c34c8e68c39ab5684e403e60b5ade654121edf`
  live with auto-deploy off. `GET /health` returned HTTP 200 with synthetic scope,
  and retry preflight returned HTTP 404 because diagnostics-only mode deliberately
  left all fixture and messaging routes unmounted. That check sent no SMS and made
  no reset, deploy, credential rotation or environment change.
- The final separately authorized attempt reached the instrumented Twilio adapter at
  `2026-10-24T19:38:00Z`. The provider returned HTTP `201` with a syntactically
  valid Verification SID and status `pending`, so the application accepted the
  Verify start; this was not a network/timeout, malformed-success or post-send
  database failure. The SMS did not arrive. Robert's later read-only Console check
  recorded the SMS delivery attempt as `undelivered`, numeric error `30007`, on
  Canada/Telus. A pending Verification is not a delivered message, and no OTP check
  or fulfillment followed. Robert submitted a Twilio support ticket. Treat delivery
  as unresolved: do not send another message or change the verification architecture
  while support investigates. Twilio documents 30007 as provider or carrier
  filtering; this record does not establish which layer made the decision.
- On 2026-10-26, Twilio support reported that its carrier partner identified a false
  positive, remediated it and requested another test. Record this only as a
  provider-reported correction; it is not a verified delivery success and does not
  clear the production phone gate. One further isolated attempt still requires the
  existing masked-destination prompt and Robert's explicit one-message authorization.
- For that retest, guarded reset deploy `dep-dbfo4vui0phs73d86vv0` at
  `ef944a0c54d7d49d6d923de8a411333109857bb1` reverified the injected service ID/name,
  database resource/host/name/user, complete schema and exclusive disposable fixture.
  The only application rows were one fixed synthetic Customer, Order, User and
  accepted-but-unverified PrivacyChallenge; every other application table was empty.
  It rebuilt the pinned baseline plus four privacy migrations, verified the four
  protection triggers, 26 customer-bearing tables and zero application rows. No
  destination, provider SID, token, OTP or credential was logged.
- Retry deploy `dep-dbfo5mui0phs73d89hq0` is live at that commit with reset and
  diagnostics disabled, deletion/phone enabled, email/fulfillment disabled and
  auto-deploy off. `GET /health` returned HTTP 200 with synthetic scope; authenticated
  loopback preflight reported ready with no fixture or message, while unauthenticated
  preflight returned the intentional sanitized 404. No SMS was sent during reset,
  deployment or preflight.
- Robert reported that the separately authorized 2026-10-26 controlled-client run
  completed with `smsAttempts=1`, an approved verification, source-order binding,
  `SUBMITTED` request status, a recorded due date, rejected fulfillment with records
  unchanged, and final `CANCELLED` status. This is one SMS attempt in this successful
  run, not a claim that only one SMS occurred across all sessions: preserve the
  earlier cancelled client session and the `403`/`21608` plus accepted-but-undelivered
  `30007` history. The sanitized Render adapter log at
  `2026-10-26T16:50:31.573Z` corroborates provider acceptance of the Verify start with
  HTTP `201`. The adapter does not log successful Verify checks and no sanitized route
  log corroborated request/status/cancel, so those are owner-provided client results.
  Fulfillment remained disabled and was not performed. This closes the isolated
  verification/request/status/cancellation check only; production activation and the
  iOS in-app verification/deletion flow remain pending.
- Cleanup is deferred only for this separately requested retest. Isolated service
  `srv-dbe3861srm7s73dgfe50` and paid database `dpg-dbe37v59fdbs73961o3g-a` remain
  active. Remove both promptly after the test and sanitized evidence capture so the
  database does not continue accruing prorated charges.
- Delete the exact isolated service/database after sanitized evidence is retained.
  This gate never authorizes production deployment, production deletion or customer
  messaging.
- The 2026-10-24 closeout inventory independently reverified the exact resource
  identities in Speedy's workspace: web service `srv-dbe3861srm7s73dgfe50`,
  `speedy-privacy-isolated`, branch `review/customer-account-deletion`,
  auto-deploy off; and database `dpg-dbe37v59fdbs73961o3g-a`,
  `speedy-privacy-synthetic`, database `speedy_privacy_synthetic`, Ohio,
  0.1c/256 MB. Production and ordering-staging IDs remain different. The connected
  Render tools expose no delete operation. Use the service dashboard
  <https://dashboard.render.com/web/srv-dbe3861srm7s73dgfe50> Settings/Danger Zone
  first, then the database dashboard
  <https://dashboard.render.com/d/dpg-dbe37v59fdbs73961o3g-a> Settings/Danger Zone;
  read back each ID/name immediately before confirming deletion.

## After deployment

- Confirm the hosting platform reports a successful deployment of the expected
  commit.
- Verify both `GET /api/v1/health/ready` and `GET /api/v1/health/live` succeed.
- Open the dispatcher and confirm authentication and live-order loading.
- Check recent production logs for startup errors and unexpected 5xx responses.
- Exercise the specific feature changed by the release with a non-destructive
  smoke test.
- Ask a matching How do I…? question and a follow-up, expand its source guide,
  and check navigation under the appropriate staff role. Release the backend
  knowledge and dispatcher destination changes together when both changed.
- Record any remaining physical-device or live-delivery field test separately;
  passing CI does not replace field verification.

## Rollback

If the service is unhealthy or the changed workflow fails, stop further rollout
and redeploy the last known healthy commit. Database rollback requires a
separate reviewed plan; never improvise a destructive production migration.
