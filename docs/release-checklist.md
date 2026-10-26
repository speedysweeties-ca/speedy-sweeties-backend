# Release Checklist

Use this checklist for backend or dispatcher changes. Mobile app publication is
a separate release and requires its own signed build and store submission.

## Node 24.22.1 advisory update (2026-10-26; separate from PR 93)

- Follow `docs/node-runtime-security-2026-10-26.md` for observed API/dispatcher/cron
  versions, owner-observed absence of `NODE_VERSION`, exact source pins, compatibility
  evidence, and the separately approved fresh-build/certificate verification plan.
- Require exact-head Linux CI, including the dispatcher production build and two
  isolated PostgreSQL timing-history checks. Do not confuse the documented local
  Mac case-collision build limitation with a successful production build.
- No dependency graph, application workflow or migration change. Never bring the
  privacy branch into this security merge. Preserve its existing recovery evidence.
- Production auto-deploy is currently on for API, dispatcher **and retention cron**;
  disable it for all three only as part of an explicitly approved rollout, before
  merging. No deployment/settings change is authorized by preparation alone.
- Runtime/CA verification and no-order/no-message smoke checks replace live mutation
  tests for this update. Do not Trigger Run on the cron: DRY_RUN still writes audit
  records. Existing staged/SMS resources are not security test targets.

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

## After deployment

- Confirm the hosting platform reports a successful deployment of the expected
  commit.
- Verify `GET /api/v1/health` succeeds.
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
