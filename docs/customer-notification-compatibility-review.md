# Coordinated customer notification review and release plan

Recorded November 10, 2026 (America/Toronto). Review and preparation only: no merge,
deployment, environment change, iOS/ASC/Play action or real notification is authorized.

## Exact review inputs and evidence boundaries

| Component | Independently reviewed Git source |
| --- | --- |
| Backend PR #132 | `9ddfb46a0b0bb5f1815c36a5a65ca627f2c77fbf`, based on `d0d124198d513de6e97aff70acfd37690fc8a51e` |
| Android PR #13 | `8f5473b50318478770d94e665e0d4e41280f2fd8`, based on `e67b200474a0afda923129147ab1ee2eb340d195` |
| Submitted iOS Build 5 source | `f4704086e3f6aac519ed9f2e507f91d1398c2848`, branch `release/customer-ios-1.0-prep` |

The owner supplied the original-Mac investigation in this review conversation.
It establishes archive version 1.0, Build 5, created `2026-11-07T02:42:34Z`
(November 6 at 9:42:34 p.m. EST), matching embedded app and exported IPA.
The owner reports all 64 recorded source-file hashes and the full path manifest
matched the Git tree above. Build number 5 was a command-line override. The
archive used an exact-tree snapshot with `uncommittedFilesIncluded: []`.

These Mac-artifact conclusions are **owner-supplied evidence**. This reviewer
read the supplied investigation and the exact remote Git source, not the Mac
archive, IPA, logs or provenance files. No independent Mac artifact inspection
or new signature/device verification is claimed. The original Mac checkout had
unrelated dirty/staged work whose historical inventory was not retained; that
does not invalidate the reported exact-tree build or mean it included that work.
The provenance investigation is completed; older preparation notes do not reopen it.

Owner-reported evidence filenames, relative to the original Mac's
`ReleaseArtifacts/` directory (filenames are recorded here; contents are not copied):

- `2026-11-06-reviewer-merged-candidate/merged-source-provenance.json`
- `2026-11-06-reviewer-merged-candidate/merge-and-build-status.json`
- `2026-11-06-reviewer-merged-candidate/speedy_merged_candidate_archive_20261106.py` (line 33: build override)
- `2026-11-06-reviewer-merged-candidate/merged-candidate-archive-result.json`
- `2026-11-06-reviewer-merged-candidate/merged-candidate-cloud-export-result.json`
- `2026-11-06-reviewer-merged-candidate/durable-artifacts.json`
- `2026-11-06-reviewer-merged-candidate/merged-candidate-cloud-export.private.log` (name only; no private log contents)
- `2026-11-06-reviewer-merged-candidate/REVIEWER_SAFE_RELEASE_1.0_5_DEVELOPMENT_ARCHIVE_NOT_UPLOADED.xcarchive.zip`
- `2026-11-06-reviewer-merged-candidate/REVIEWER_SAFE_LOCAL_APP_STORE_EXPORT_NOT_UPLOADED/Speedy Sweeties Customer iOS.ipa`
- `2026-11-06-build5-upload-and-fixed-checklist/upload-result.json`
- `2026-11-06-build5-upload-and-fixed-checklist/upload-closeout.json`
- `2026-11-06-build5-upload-and-fixed-checklist/apple-processing-history.jsonl`
- `2026-11-06-build5-upload-and-fixed-checklist/release-checklist.before.txt` (line 46: original checkout context)

The owner reports matching executable UUIDs and recorded binary checksums,
successful archive/export, one upload of that existing IPA without rebuilding,
and Apple's subsequent VALID processing result. Historical NOT_UPLOADED names
are not current upload-status evidence.

## Submission chronology: preserve the later reported closeout

The November 6 `2026-11-06-asc-entry/saved-readback-final.json` and
`entry-closeout.json` report PREPARE_FOR_SUBMISSION / appReviewSubmitted:false
at that earlier time. They **predate** the owner/VS Code-reported November 9
10:27 p.m. EST submission (`2026-11-10T03:27:00Z`).

The later reported result is **Waiting for Review**, with provenance recorded in
[the November 9 backend handoff](START_HERE_ANDROID_CUSTOMER_HANDOFF.md#apple-submission--completed)
and [release checklist](release-checklist.md). That is a dated reported closeout,
not a fresh ASC inspection in this review. Absence of a later readback in the
Mac's older retained package does not prove submission failed. Do not resubmit,
change ASC, rebuild iOS, or reopen completed submission work on that basis.

## Independent source compatibility findings

All iOS references below use the exact owner-associated revision
[`f4704086e3f6aac519ed9f2e507f91d1398c2848`](https://github.com/speedysweeties-ca/speedy-sweeties-customer-ios/tree/f4704086e3f6aac519ed9f2e507f91d1398c2848).

| Existing Build 5 behavior | Backend #132 compatibility |
| --- | --- |
| [OrderService.swift:42-84](https://github.com/speedysweeties-ca/speedy-sweeties-customer-ios/blob/f4704086e3f6aac519ed9f2e507f91d1398c2848/Services/OrderService.swift#L42-L84): normal POST /api/v1/orders, optional fcmToken from local store; protected synthetic path omits FCM | Existing request schema, creation route and credential response remain. New nullable/defaulted database columns require no client field. No order or synthetic request was sent in this review. |
| [OrderService.swift:144-177](https://github.com/speedysweeties-ca/speedy-sweeties-customer-ios/blob/f4704086e3f6aac519ed9f2e507f91d1398c2848/Services/OrderService.swift#L144-L177): GET /api/v1/orders/track-token/:token; UUID route only for saved orders without a token | Both existing routes and tracking response fields remain. A rejected token request throws; this method does not retry through UUID tracking after rejection. New notification references cannot authorize either route. |
| [OrderService.swift:180-232](https://github.com/speedysweeties-ca/speedy-sweeties-customer-ios/blob/f4704086e3f6aac519ed9f2e507f91d1398c2848/Services/OrderService.swift#L180-L232): business status, bearer loyalty-token and legacy loyalty reads | Existing routes/authentication remain; no new use of legacy access is introduced by #132. Existing privacy, AI and driver APIs are also unchanged by its route/controller delta. |
| [App delegate:164-277](https://github.com/speedysweeties-ca/speedy-sweeties-customer-ios/blob/f4704086e3f6aac519ed9f2e507f91d1398c2848/Speedy_Sweeties_Customer_iOSApp.swift#L164-L277): local FCM refresh storage, incoming notification presentation and generic in-app event | Notification+data envelope, customer type strings and Android channel remain. iOS does not require schema, reference, eventId or expiry keys and does not turn them into access credentials. Deletion guard still suppresses its local refresh event. |
| [ContentView.swift:913-920](https://github.com/speedysweeties-ca/speedy-sweeties-customer-ios/blob/f4704086e3f6aac519ed9f2e507f91d1398c2848/ContentView.swift#L913-L920): notification event refreshes rewards; [1792-1808](https://github.com/speedysweeties-ca/speedy-sweeties-customer-ios/blob/f4704086e3f6aac519ed9f2e507f91d1398c2848/ContentView.swift#L1792-L1808): active Track Order polls every five seconds | Existing behavior is preserved; Build 5 does not acquire Android's new order-specific tap routing. [Receipt total](https://github.com/speedysweeties-ca/speedy-sweeties-customer-ios/blob/f4704086e3f6aac519ed9f2e507f91d1398c2848/Models/OrderModels.swift#L253-L279) comes from tracking, not notification text. |

The backend deliberately changes customer alert text to a generic app-opening
prompt and adds a persisted 15-minute event deadline, TTL and collapse metadata.
Amounts/private details are no longer included in alerts. This is a source-compatible
privacy/delivery-window change, not a claim that notification text or timing is
byte-for-byte unchanged. Driver notification sending is unchanged.

**Build 5 does not implement the new authenticated GET/PUT token API, revisions,
operation UUIDs, public-reference routing, or client-side event freshness checks.**
FCM rotation is stored locally and affects a later normal order submission; it
does not replace/remove an existing order association. Existing tracking/rewards
remain the way to obtain current information if push delivery becomes unavailable.
The backend must not fabricate a renewal, weaker authorization or order to close
that gap. An iOS rebuild merely to add Android's synchronization is not a
prerequisite for this compatible backend release and is not part of this task.

Android #13 alone implements the new authenticated synchronization and reference
routing, with bounded retries, rejected-access stops and deletion-generation guards.
One token destination per order is retained; concurrent devices do not get fanout.
Separate source review and isolated tests support compatibility. Physical APNs/FCM
delivery, OS lifecycle timing and real credential storage remain unperformed checks.

## Coordinated plan: separate authorization at each execution boundary

The exact documentation-successor candidate SHAs, required CI links and normal
merge guards are recorded together in PR #132 and PR #13 descriptions. Runtime
review inputs remain the table above. No merge/deploy has occurred in this review.

1. **Review/merge gate.** Re-read both exact candidate heads, required checks and
   review threads. Require normal repository protections and a matching-head guard.
   Authorize backend #132 first; record its integration SHA and compare its runtime
   tree with the reviewed candidate. A moved head/base or runtime delta requires
   renewed review and checks. Never bypass protections. No iOS/ASC work is needed.
2. **Migration and isolated release qualification.** Under separate authorization,
   use an existing qualified isolated environment and synthetic database with
   provider delivery stubbed. Apply only additive migration
   `20261110160000_customer_notification_revision`: Order.fcmTokenRevision INTEGER
   NOT NULL DEFAULT 0; Order.fcmTokenMutationId TEXT NULL. Apply it before running
   the new Prisma client/backend; retain all old columns/associations and existing
   revocation records. Use the repository's reviewed migration/release procedure,
   not migrate-dev/reset/db-push against production. Do not provision or enable a
   chargeable service without approval. Record exact artifact/commit and schema.
   Repeat the combined authenticated contract, removal/replay/expiry/revocation/
   concurrency/deletion checks on the integrated backend; no real notifications.
3. **Backend deployment gate.** Obtain exact-integration/artifact authorization.
   Recheck existing target identity, live revision, schema/migration history,
   readiness, release configuration and protected revocation consumers read-only.
   Do not infer current production settings from older records or change them.
   Coordinate the additive migration and backend deployment with the existing
   release procedure. No new secret, JWT rotation, environment change, driver
   change or paid infrastructure is required. Keep auto-deploy policy unchanged.
   Verify expected commit, live/ready health and ordinary read-only behavior.
4. **Android merge/release gate.** Normally merge the exact approved Android head
   with its guard; record integration SHA. Recheck tree equivalence/full CI against
   the released backend contract. Complete real Keystore, signed/minified release
   and Android disclosure review before any separately authorized Play rollout.
   Against an older backend the app stays visibly unsupported with no fallback.
   Preserve Home, Track Order, age gating and deletion/payment/loyalty fixes.
5. **Separately authorized physical-device qualification.** Use dedicated owned
   devices/destinations and an approved test-data plan. Never reuse Apple reviewer
   enrollment, orders or message allowances. Android: grant/deny/re-enable
   permission; rotate/revoke tokens; temporary outage/restart/lost response;
   foreground/background/terminated taps; malformed/duplicate/expired/unrelated
   events; concurrent devices; deletion while synchronization/send is in flight;
   Home/back stack/19+ gate and no private notification/log content.
   Build 5: use the existing owner-associated binary, verify generic alerts,
   presentation/tap refresh and tracking/rewards/receipt reads. Do not expect the
   new token API or Android routing. Its source hardcodes the production base URL;
   simulator-only injected test loading is not an override in the submitted build.
   Therefore isolated CI is not an exact-binary device test. Any live Build 5
   observation after backend deployment needs its own explicit bounded approval
   using an existing legitimate order or separately approved non-reviewer fixture;
   do not silently redirect it, weaken TLS, create orders or rebuild it.
6. **Accept/hold.** Retain device/OS/build/commit/schema, sanitized test outcomes
   and known delivery limits. Stop further rollout on failed auth/deletion or
   private-content checks; do not retry an ambiguous live operation blindly.
   Source compatibility can be accepted now; delivery/signed-release/disclosure
   qualification remains separately recorded until actually performed.

## Recovery limits

Prefer a reviewed forward fix. Retain the two additive columns on rollback;
there is no destructive down migration in this change. A backend rollback must
retain existing targeted-revocation tombstones/consumers and never predate those
safeguards. It loses the new API and new generic/event-fenced sending behavior.
Android rollback loses synchronization/new event parsing; old iOS behavior remains
as documented. Auth expiry/revocation cannot be repaired through ID/phone/email,
the public stub or a new order. A separately authorized JWT-key rotation changes
references; unmatched old hints safely become unavailable.

Removal/deletion fences future database associations and late writes. A provider
message already queued, in flight or displayed cannot always be recalled.
PostgreSQL and FCM/APNs do not share atomic cancellation; even a send accepted
just after the last database check can outlive deletion. Registration/HTTP success
is not delivery proof. No rollback or disclosure language may promise universal recall.

## Review result and remaining validation

No concrete source-compatibility or authorization/deletion blocker was found at
the reviewed runtime revisions. Existing full backend CI 767/768 and Android
79/80 (including actual Retrofit + isolated PostgreSQL) passed. Relevant checks
for documentation successors are recorded in the PR descriptions; neither tests
nor an owner-supplied artifact report constitutes a new physical-device pass.

Build 5 provenance and the later reported submission closeout are resolved
evidence items. Outstanding: actual-device APNs/FCM delivery/lifecycle, real
Keystore, signed Android release and Android disclosures. Existing dependency
advisories remain a separate recorded maintenance task. All original local work
and the review report must stay untouched. No iOS rebuild, resubmission, ASC/Play
edit, live operation, Apple allowance use or deployment is performed by this plan.
