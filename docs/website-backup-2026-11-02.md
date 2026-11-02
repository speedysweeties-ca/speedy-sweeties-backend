# Speedy Sweeties webpage backup — November 2, 2026

Saved before the owner-authorized website copy refresh.

## Frozen original

- Full original source commit: `4a70a433ea794b97fdf8c8f7142e6e2b5e05d54e`.
- Frozen branch: `backup/speedy-sweeties-webpage-2026-11-02`.
- Source: https://github.com/speedysweeties-ca/speedy-sweeties-backend/tree/backup/speedy-sweeties-webpage-2026-11-02
- Download complete source ZIP: https://github.com/speedysweeties-ca/speedy-sweeties-backend/archive/refs/heads/backup/speedy-sweeties-webpage-2026-11-02.zip
- View original on Render: https://speedy-sweeties-webpage-backup-2026-11-02.onrender.com
- Backup Render service: `srv-dbke1cijnfac738pkc10`; deploy `dep-dbke1cqjnfac738pkckg`, verified live before edits.
- Backup build: `node website/scripts/build.mjs`; publish `website/dist`; auto-deploy OFF.

The complete repository at the original deployed revision is preserved, including
all website HTML, local images/fonts/styles, form/validation/tracking/analytics/
verification JavaScript, five landing-page sources, privacy renderer, build scripts,
lockfiles and tests. The Render viewing copy uses the existing noindex preview mode:
it accepts no orders, emits no analytics and does not read customer tracking storage.
This isolation does not remove or rewrite the preserved production functionality.

This is a website/code backup, not a snapshot of live customers/orders or secret
configuration. Restoring the webpage does not require overwriting the database.
The API remains a separate live dependency. No database, API or dispatcher deployment
is part of the copy refresh.

## Existing production configuration

- Workspace: Speedy's workspace (`tea-d7loaul7vvec73cme5d0`).
- Website service: `srv-dbhpmv2jnfac73ak6ip0`.
- Domain: https://www.speedysweeties.ca/
- Repository: speedysweeties-ca/speedy-sweeties-backend; branch `main`.
- Build: `node website/scripts/build.mjs --production`; publish `website/dist`.
- Existing owner-held `TURNSTILE_SITE_KEY` stays in Render; preserve existing
  environment, domains, redirects and headers. No secrets are required in this file.
- Auto-deploy OFF; prior healthy deploy `dep-dbhvms9srm7s73e3mfig`.

## Restore the old webpage while preserving newer backend work

1. Make a fresh branch from current main.
2. Restore ONLY the website folder from the frozen revision:
   `git restore --source=4a70a433ea794b97fdf8c8f7142e6e2b5e05d54e -- website`
3. Run the website tests and build; review the diff and normal current-head CI.
4. Commit/merge that website-only restoration, then manually deploy ONLY the
   production website service using its existing production build/environment.
5. Verify the original text, assets, navigation, form validation, hours gating,
   verification and tracking. Do not create a live order without coordination.

For immediate website-only recovery, Render can deploy the original commit above
on the website service using its existing configuration. Do not deploy that older
repository revision to the API, dispatcher or cron services. The frozen source
branch is the durable fallback even if Render expires an old build artifact.

## Copy-refresh validation

Website synthetic tests cover order payload, rejection/retry, closed hours,
verification, preview isolation, landing links, age gates and assets. All 19 passed
locally. Dispatcher-help scope check passed (zero implementation changes).
The privacy policy and website runtime JavaScript are unchanged. Pricing amounts,
form identifiers and the required acknowledgements are preserved. Existing CI is
required on the final branch head before merge. Dispatcher guide IDs/questions:
not applicable; this changes customer-facing website wording only.
