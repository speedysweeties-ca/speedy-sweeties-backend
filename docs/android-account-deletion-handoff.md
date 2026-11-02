# Android customer deletion handoff — implementation deferred

Updated 2026-10-23. Android draft PR 9 remains preserved at commit
`188e90593f657da5c746babe7aedc12f73954fba`. It is not merged, released or changed
by the current iOS/backend preparation. This document maintains the shared contract
for a later Android review.

## Shared API contract

- `POST /api/v1/privacy/challenges` accepts exactly one existing installation
  credential: `trackingToken` or `loyaltyToken`; later recovery may use the privacy
  bearer credential.
- `POST /api/v1/privacy/challenges/:id/verify` verifies the fresh purpose-bound code.
- `POST /api/v1/privacy/requests` creates or recovers one request idempotently.
- `GET /api/v1/privacy/requests/:id` returns status, `version`, `canCancel`, message,
  exact `completionTimeframe`, exact ISO `dueAt`, and the retained-information summary.
- `POST /api/v1/privacy/requests/:id/cancel` cancels only before fulfillment.
- Privacy access and request-status secrets remain bearer credentials. They are never
  contact selectors and must stay in Android Keystore-encrypted app-private storage.

The endpoints and response fields are additive. Existing order, tracking, loyalty
and authentication APIs are unchanged, so the shared backend remains compatible
with the currently released Android app, which does not call these privacy routes.
With `PRIVACY_DELETION_ENABLED=false`, only the new privacy route is unavailable.

## Shared policy/configuration

- Policy: `SS-RETENTION-2026-10-23`.
- Normal completion wording: `Normally within 30 calendar days after verification;
  an ownership conflict or legal hold may require longer.`
- Fiscal year-end: `PRIVACY_FISCAL_YEAR_END_MM_DD=12-31`.
- Owner-approved operational reviews: minimized deletion-request/audit evidence is
  first reviewed 24 calendar months after actual closure; the anti-reactivation
  marker is first reviewed 24 calendar months after `databaseErasedAt`. These are
  review dates, not minimum retention periods, automatic deletion dates, legal
  requirements or Apple-approved durations. Extensions require a documented reason
  and next review date; preserve the marker while a verified restore or unresolved-
  case risk remains.
- Financial evidence is retained generally until at least six years after the end
  of the last tax year containing the affected order, subject to a longer applicable
  hold. The request date is not the calculation start.
- Eligible profile/preferences/loyalty data and access are removed; restricted
  readable receipt evidence remains. Restore/recreation guards stay active.
- There is no automatic two-year inactive-profile deletion.

## Later Android review

When Android work resumes, rebase/review PR 9 against the then-current backend,
rerun its unit/APK checks, verify exact policy/URL text, and test against an authorized
synthetic backend deployment. Do not infer an Android release from backend or iOS
approval. Google Play publication and the external deletion URL remain deferred.
