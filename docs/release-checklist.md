# Release Checklist

Use this checklist for backend or dispatcher changes. Mobile app publication is
a separate release and requires its own signed build and store submission.

## Before opening the pull request

- Confirm the worktree contains only the intended release.
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
- Delete the exact isolated service/database after sanitized evidence is retained.
  This gate never authorizes production deployment, production deletion or customer
  messaging.

## After deployment

- Confirm the hosting platform reports a successful deployment of the expected
  commit.
- Verify `GET /api/v1/health` succeeds.
- Open the dispatcher and confirm authentication and live-order loading.
- Check recent production logs for startup errors and unexpected 5xx responses.
- Exercise the specific feature changed by the release with a non-destructive
  smoke test.
- Record any remaining physical-device or live-delivery field test separately;
  passing CI does not replace field verification.

## Rollback

If the service is unhealthy or the changed workflow fails, stop further rollout
and redeploy the last known healthy commit. Database rollback requires a
separate reviewed plan; never improvise a destructive production migration.
