# Start here: Apple submission closeout and Android customer handoff

Recorded November 9, 2026 (America/Toronto).

## Evidence and scope

This handoff consolidates Robert's reported execution/ASC readbacks in the release
conversation and merged backend source. The production and ASC results below are
owner/VS Code-reported closeouts, not a fresh independent live inspection by the
author of this document. They are a dated baseline, not a claim about future state.

No credentials, reviewer contact/address values, verification codes, private
environment values, or customer/order IDs belong in this document or Git.
Mac-local release artifacts have NOT been bulk uploaded. Their existence does not
prove they are available on another laptop. The Android and iOS source repositories
and the other laptop's working copy have not been inspected in this handoff.

## Apple submission — completed

- App: Speedy Sweeties Delivery, ASC app ID 6818671633.
- Version 1.0, Build 5 submitted November 9, 2026 at 22:27 EST
  (November 10 at 03:27 UTC).
- Result reported: Waiting for Review.
- Automatic release after Apple approval; Canada-only; C$0.
- Final reviewer instructions/review notes saved and verified.
- All 14 approved privacy disclosures published; only Other Data is not linked.
- Age Assurance = Yes remains the reconciled answer for Build 5's persisted 19+
  access gate. Do not describe it as independent identity/age proof.
- Owner screenshot observations: DSA Active/completion message; app information
  displays non-trader; Digital Goods and Services questionnaire absent, not saved No.
  These observations do not establish legal status or EU availability.
- Physical-iPhone testing remains a disclosed validation gap, not an established
  submission blocker; do not claim an unperformed device test passed.
- Apple approval/launch have NOT been reported. Submission is complete; review is pending.

Do not withdraw/resubmit Build 5, alter its store information, or rebuild iOS merely
to start Android work. Completed release checks stay closed unless evidence of a
specific regression requires targeted investigation.

## Completed backend and policy work

- R1: deletion request intake and email verification activated and request-only
  website policy published; authenticated ADMIN/journal checks passed.
- S3: fulfillment enabled and matching operational policy published. Real deletion
  requires explicit case authorization; enabling does not automatically process cases.
- Privacy flags at last closeout: request true, email true, phone false,
  fulfillment true. Both API/website Auto-Deploy off; API pre-deploy empty.
- Website operational-policy revision reported:
  94f5cd977028aaa7643f6c03ffbfd7f1b1f47f09.
- API targeted-revocation integration deployed and guarded operation completed:
  09870ec9cd87ba81f23b4b3047dd5f728bb2da7d (PR #130).
  Do not assume this remains the live revision without read-only inspection.
  The final revocation deployment ID was not supplied in the conversation closeout.
- No actual deletion request was created by the S4 readiness work. Availability
  and policy alignment do not establish completion of real external-copy erasure.
- Existing standing connectors/Dashboard sessions remain; do not disconnect them
  as temporary-credential cleanup.

### Merged source trail

| PR | Purpose | Integration revision |
| --- | --- | --- |
| #125 | Operational fulfillment policy | 94f5cd977028aaa7643f6c03ffbfd7f1b1f47f09 |
| #126 | Safe enrollment diagnostics and identical in-memory validation/enrollment payload | 6c170d0ae64fbf704ac39c9d7e17860a14bacd03 |
| #127 | Private configured reviewer mailbox; fail closed on invalid configuration | 25088ebd668dc0fd050d82166d91dfe288588182 |
| #129 | Shared native civic-address verification and guarded unused-policy address correction | e6d13f4d940f12ed9a267cb1d4f7b025af6f7e9e |
| #130 | Targeted revocation of exposed synthetic tracking/old loyalty credentials | 09870ec9cd87ba81f23b4b3047dd5f728bb2da7d |

Follow the source and merged tests for exact behavior; this table is not a deploy plan.

## Reviewer readiness and credential containment — completed

- S4 backend/browser readiness PASSED.
- One protected readiness order was created and automatically cancelled; no driver
  assignment, dispatch, FCM, receipt, purchase or payment occurred.
- First email arrived but code verification returned generic HTTP 400; cause was
  not established. A separately authorized recovery email/code verified successfully.
- Policy: ACTIVE at closeout, expires 2026-11-16T14:47:30Z
  (November 16, 09:47:30 Toronto). Do not silently extend it.
- Usage: 1/6 orders and 2/3 emails consumed; 5 orders and 1 email remain; no SMS.
  One expected synthetic customer linked; one address correction audit retained.
- Exposed original tracking and old loyalty credentials were disabled and
  independently verified in the reported production closeout.
- Customer data, policy, original expiry/allowances, and independent privacy access
  were preserved. The privacy-access plaintext was cleared; do not invent a retained
  credential or transfer a token from chat.
- Fresh-app reviewer access remains supported by existing tests; no new live-device
  pass is claimed. Private handoff excludes exposed credentials.
- Reserve remaining Apple reviewer allowance. Android testing must not reuse this
  bounded Apple policy or consume its final email without separate authorization.

**Critical recovery rule:** after PR #130 revocation, old code can ignore the
customer-scoped revocation record and reactivate old loyalty credentials. Preserve
that record and cleared tracking hashes. Do not automatically roll back to code
without both loyalty-consumer checks. Use the specific recovery limits in
[s4-exposed-credential-revocation.md](s4-exposed-credential-revocation.md), not a
generic old-code rollback instruction.

Keep the reviewer mailbox and agreed live-call relay available. If Apple has not
finished review before policy expiry, arrange an authorized access solution;
do not pretend the policy is indefinitely valid.

## Approved privacy snapshot for reference

This records the owner-approved iOS disclosure baseline, not an automatically
valid Google Play Data safety declaration. Android SDKs/data flows must be checked.

F = App Functionality; A = Analytics; M = Developer Advertising/Marketing.
All 14 were declared not used for tracking.

| Type | Purposes | Linked to identity |
| --- | --- | --- |
| Name | F, M | Yes |
| Email Address | F | Yes |
| Phone Number | F, M | Yes |
| Physical Address | F | Yes |
| Health | F | Yes |
| Payment Info | F, A | Yes |
| Precise Location | F | Yes |
| Other User Content | F | Yes |
| User ID | F, A, M | Yes |
| Device ID | F | Yes |
| Purchase History | F, A, M | Yes |
| Other Usage Data | A | Yes |
| Other Diagnostic Data | F, A | Yes |
| Other Data Types | A | No |

## Next master-list priority: APP-04 Android customer app review

The agreed October 22 priority was Apple release first, then Android review.
Apple is now submitted and waiting externally. Review the Android CUSTOMER app
(package historically ca.speedysweeties.customer), not either driver app.

### Safe setup on the other laptop

1. Open the existing Android customer project in VS Code.
2. Inspect git status, remotes, current branch and commit; preserve local changes.
   Do not hard reset, clean, overwrite files, or switch branches over uncommitted work.
3. Fetch its remote refs and identify the actual source/build/release baseline.
   Do not assume backend main contains the Android app or identifies the Play build.
4. Clone/fetch this backend repository separately for comparison. Read this file,
   AGENTS.md and docs/release-checklist.md. Follow Android repository instructions too.
5. Inventory local-only source and release evidence. If needed, prepare a sanitized
   sync commit in the correct repository; never upload .env, keystores, signing
   passwords, service-account files, tokens, private reviewer artifacts or DerivedData.
6. Identify the installed/internal/production Android version from evidence. Old
   remembered SDK/version numbers are not authoritative. Distinguish source, built
   artifact, uploaded release, installed build and live backend.

### Comparison scope

Produce a concise table: area, Android evidence, current backend/iOS baseline,
status (done / concrete gap / not yet verified), and minimal next action.

Inspect:
- Screen/navigation flow: Home works; retain the visible label Track Order.
  No unsolicited redesign of the working layout.
- Persisted 19+ gate, under-age blocking, open/closed business behavior.
- Order fields, unit/buzz separation, civic address validation, accepted enum values,
  item/catalog handling, optional fields and useful validation errors.
- Favorites/reorder, tracking statuses and token-based access; expired/revoked-token
  handling without legacy access bypass.
- Loyalty token storage/refresh and the new subject-specific revocation behavior.
- Email privacy verification, challenge/session binding, expiry/error behavior,
  request/status/cancel/confirmation flow, and phone-disabled handling.
- Push/notification permissions and state refresh, including reconnect/background use.
- Voice-ordering confirmation/edit/cancel and actual consent/data handling.
- Actual SDK/dependency/manifest/signing/build compatibility, using current official
  Android/Google Play requirements where relevant.
- Google Play track/status, release blockers, app access, privacy/deletion links,
  content/age declarations and Android-specific Data safety accuracy. Do not copy
  Apple's declarations without checking Android's actual collection and SDKs.

Reuse applicable completed backend CI/evidence. Run focused Android checks in an
isolated environment; avoid repeating every iOS/backend test just for paperwork.
Record missing physical-device checks honestly, and tie blockers to concrete defects
or requirements rather than inventing new approval stages.

Initial scope is comparison and preparation, not production mutation or store
publication. Do not create real orders, send SMS/email/push, delete customers, alter
Apple reviewer access, deploy, rotate shared keys, or change Play/ASC declarations.
Before any new paid service/API usage, explain charges/allowances in CAD and obtain
approval. Existing API access does not prove a new use is free.

## Portable VS Code starting prompt

> Read docs/START_HERE_ANDROID_CUSTOMER_HANDOFF.md from the backend repository.
> Apple version 1.0 Build 5 was submitted November 9 at 22:27 EST and is waiting for
> review. Preserve that release and its reviewer access. Start APP-04: inspect this
> laptop's Android customer project, its git state and release evidence, then compare
> its actual implementation with the current backend and this handoff. Preserve local
> edits; do not assume the projects share a repository. Report what is already done,
> concrete gaps and the shortest remaining Android release path. Use safe local tests
> without consuming the Apple reviewer policy or causing production activity.
> Do not repeat completed work or invent additional launch requirements.

## Evidence provenance and local-only records

The owner reported that the Mac release checklist/submission records were updated.
Original local records include the release execution closeouts, the final private
reviewer handoff, ASC final package, and S4 email/revocation evidence. They were
located beneath the customer iOS project and its ReleaseArtifacts/ReleaseNotes or
.xcodeproj workspace directory. This document is the sanitized portable summary,
not an assertion that those local files or mobile source have been uploaded.

Older preparation-only headings in repository docs describe historical gates.
The reported completion states above supersede those gates for the already
completed November 7–9 work; they do not grant permission for new operations.
