# Standalone website privacy policy — October 29, 2026

## Authorized scope and compatibility

Robert approved publishing the dedicated privacy page while preserving existing
links and carrying mobile-link changes into the next planned app releases. This
website-only change publishes the current homepage statement at
`https://www.speedysweeties.ca/privacy-policy/`. The homepage statement remains
at `/#privacy-policy`; `/privacy/` provides a readable noindex compatibility copy.
Slashless paths must be checked on the live static host before completion.

The build derives both standalone copies from the homepage's published policy,
with semantic headings, navigation and a readable responsive layout. No new data
collection, form, consent control, provider integration, retention statement or
account-deletion promise is added. The prior effective/updated dates remain.
The dedicated policy does not load Analytics or ordering scripts. Service-page
footers and the homepage policy heading point to its canonical address.

## App and store-link observations

- iOS release preparation branch `release/customer-ios-1.0-prep`, exact source
  `e929c8eb1d929ae8319693e06c56707f65fb8eca`: in
  `Services/VoicePrivacy.swift`, `PrivacyPolicyConfiguration.publishedURL` is still
  `nil`. The release handoff proposes `/privacy-policy` and says its final app
  policy must cover the separately verified production/app behavior before that
  value and App Store Connect metadata are configured. No setting was changed.
- Android default source `8b0001b2397f78e527419867b539ae2250e8cd44`:
  all 49 main-source Kotlin and values-XML files were read; no privacy-policy,
  account-deletion or business-website link reference was found in that scope.
  This does not establish the contents of the binary currently installed from
  Google Play. No Android code or release branch was changed.
- Public store searches did not provide a verified app listing. A read of the
  current source package's Google Play URL was unavailable through the search
  tool. The actual published Google Play/Apple privacy metadata has therefore
  not been read back or changed. Do not claim either store already uses the new
  URL, or infer that a source branch equals a released mobile build.

The final app-release operator should use the same stable website route after
reconciling the final app policy and production provider/deletion facts. Recheck
both the in-app link and store metadata in the normal release review; preserve
older website routes. Apple's current guidance releases changed policy URLs with
the next app version. Google exposes the URL in Play Console > App content.

References checked October 29, 2026:
- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- https://support.google.com/googleplay/android-developer/answer/9859455?hl=en

## Account-deletion and app-policy boundaries

`webflow/account-deletion-page.html` and iOS
`ReleaseNotes/PRIVACY_POLICY_PROPOSED.txt` remain unpublished activation/review
copy. This public website policy is the already published statement, not the
unverified final app-policy candidate. Publishing it does not complete the iOS
policy/retention/provider gates or permit enabling the nil app URL automatically.

The separate backend rollout still owns provider delivery, recovery/fulfillment,
monitored manual initiation and in-app evidence. Do not publish the draft's
functioning deletion or restore-protection claims until verified. No new deletion
page, API call, privacy gate, IAM/AWS operation, database command, message or app
store submission belongs to this release. The existing homepage privacy contact
and request wording remain available.

## Validation and deployment

- Run website tests and preview/production builds. Verify the policy's wording is
  shared with Home, the old fragment remains, all five service footers link the
  new page, and the sitemap has seven canonical URLs.
- Browser-check desktop and narrow/mobile layouts, table-of-contents anchors,
  provider/contact links and the old homepage fragment. No order or private token
  is needed. Legal content must be readable without age, login or bot challenges.
- Run repository-required checks and current-head CI. Dispatcher guide IDs and
  example questions: not applicable; no staff workflow changes. Run the help guard.
- Target only Render website `srv-dbhpmv2jnfac73ak6ip0` in the previously confirmed
  Speedy workspace `tea-d7loaul7vvec73cme5d0`, branch main, auto-deploy off, existing
  production build and `website/dist` output. No environment/DNS change is needed.
- Prior healthy website source and rollback target:
  `52e8a53060b78e7d8dee9b1eb9a6c140753c8f21`, deploy
  `dep-dbhuae8473hc7394tcq0`. Preserve the disabled Render subdomain.
- After website deployment becomes live, verify exact source, canonical URL,
  slashless/apex routes, legacy fragment/compatibility page, footer links and
  seven-URL sitemap. Record the new deploy and review evidence in the PR.
