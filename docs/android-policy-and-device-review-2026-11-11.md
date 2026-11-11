# Android policy, declaration comparison and smallest device sessions

November 11, 2026 (America/Toronto). Review preparation only. No declarations are
entered/saved/submitted, no signed build is created and no production changes occur.

Owner-export addendum: the current Console answer evidence is now resolved by
`data_safety_export.csv`, SHA-256
`30df563c8f0be1c9820b7dc9dde6e2b8054b7ad536c440dfb442cb6425836709`.
The owner also confirmed service/receipts/loyalty use only, with no promotion.
The [final proposed answer set](android-play-final-proposed-answers-2026-11-11.md)
supersedes this worksheet's earlier conditional proposals and evidence gaps.
No further Console-navigation handoff is needed to compare the saved answers.

## Completed Android review and merge

PR #15 reviewed head `57514ef86163710ceffc8da7a6371a17b3542314` merged normally as
`58dd9cb37dc8deebb710ab8777ff93d1f3a7e687`. Both Git trees equal
`68511af7d079d9dea34830d23d010fdf2154f8c2`. Immediately before merging the head
was unchanged, both existing CI checks passed and reviews/inline threads were empty.
Normal merge used the expected-head guard; protections were not changed/bypassed.
CI #85 attempt 1 is reused, not rerun for this review:
https://github.com/speedysweeties-ca/speedy-sweeties-customer-android/actions/runs/43036767702

Code review traced Agree and speak -> session begin -> microphone permission or
recognizer. Disclosure dismissal/Not now, permission denial, non-OK recognition,
absent recognizer and security rejection do not deliver a transcript. Typing is
independent of agreement. The session checks customer generation/input allowance;
deletion cancels customer jobs, clears UI and replaces the navigation session.
Backend draft responses also check generation before applying results. No new
candidate or code repair was required. This is source/synthetic evidence, not a
physical microphone or Keystore pass. Merged code is not the Play-installed 1.0 (5).

## Website review scope

Base `0207351e39ae385e59e8da8b92d066a15cbc1625` includes website PRs #135-137.
Preserve their attribution disclosure, date guards and production preview-warning
fix. The new Android policy is an overlay selected only by
`--proposed-android-privacy-policy`. Ordinary output and the exact approved source
hash stay intact. Production explicitly refuses the Android preview even if old
approval/date environment settings exist. A future publication change requires a
separate reviewed release/date; this PR does not deploy or change Render settings.
No dispatcher screen/workflow is affected; guide IDs/example questions: none.

The overlay qualifies iOS-only Keychain/Apple location/persistent-consent wording,
adds actual Android location/Places/Maps, external recognition, text/history/cart
processing, Firebase auto-identifiers and authenticated notification association
behavior, and distinguishes Android 1.0 (5) from versions presenting per-request
agreement. Financial retention, verified recovery, request status and external-copy
limits are retained. It does not promise recall of queued/delivered notifications.

The backend voice path sends transcript/history/cart to OpenAI Responses with
`store:false`, and can verify product names via approved-retailer web searches.
No device audio is sent to that backend. The system recognition activity can
stream audio remotely. Google documentation confirms SDK metadata/identifier/
diagnostic collection and Firebase Installations' role in delivery. The absence of
Firebase Analytics/Crashlytics in the resolved app graph does not mean zero SDK data.

## Logo report — separate, reproduction not completed

The owner's Samsung report remains valid owner evidence. A fresh public JPEG
download decodes and renders as the Speedy Sweeties car/text logo; page/image HTTP
200 does not reproduce the reported browser appearance. No connected browser or
native app surface was available, and opening the in-app browser failed as
unavailable. Do not replace the image or change CSS speculatively. The owner already
confirmed the policy link opens; the logo report alone is not an Android submission
blocker. Reproduce at the owner's actual browser/zoom before proposing a separate fix.

## Current published Play label versus the draft

Read-only Canadian public listing and its linked details page returned HTTP 200:

- https://play.google.com/store/apps/details?id=ca.speedysweeties.customer&hl=en_CA&gl=CA
- https://play.google.com/store/apps/datasafety?id=ca.speedysweeties.customer&hl=en_CA&gl=CA

These are published owner declarations, not verified processing behavior or the
private Console form. Snapshot: no data shared; approximate/precise location
optional for functionality/security; name, email, address and phone for
functionality/security; encryption in transit. No other collected categories or
deletion request information appeared. Absence of a deletion badge does not prove
that the private deletion answer is No. The listing showed September 20 as its
update date; that does not identify every current active track/version.

The owner-exported CSV now supplies all saved form values, including explicit
false and genuinely blank cells; it does not encode a track/version inventory.
Historical evidence showed production/internal 4
and closed alpha 2; the later owner-reported Play update and installed code 5 do
not establish its distribution beyond that handset. Internal-only artifacts are
exempt from the Data safety section. Include the union for applicable production,
open and closed-track versions; do not use Internal-only code 5 as the sole basis
for changing a public label. Keep applicable older voice/SDK behavior in scope.

| Proposed response / change | Source-based conclusion; current-form action remains review-only |
| --- | --- |
| Collect data? | Yes. Keep the four contact fields and both location types. Contacts required for ordering; optional unit/buzz. No device-GPS order field, but coordinates can reach location/geocoder/Maps. |
| Encryption | App API cleartext disabled/HTTPS; Google SDK documentation describes HTTPS. Keep Yes for inspected app-controlled requests; external recognition is a separate provider activity, not proof of an app TLS defect. No special end-to-end-encryption claim. |
| Order data | Add purchase history and other user-generated content for orders/notes/transcript/history/cart. No direct card/bank-account collection found: payment-method choice is transaction information. App functionality and actual backend reporting/retention apply. |
| Identifiers / SDK performance | Include Firebase/Maps installation/SDK identifiers; applicable Maps/Places interactions, crashes and diagnostics for functionality/analytics. The published label omits these categories. Provider docs describe current SDKs; note that limitation for older artifacts rather than inventing an SDK security defect. |
| Search / health | Item/address searches leave the device. Health information is optional if prescription-related pickup instructions are provided as supported by the published service policy. Do not infer unrelated sensitive categories just because free text exists. |
| Audio | Draft optional voice/sound processing for the selected external recognizer unless the current form/provider flow supports an out-of-app exclusion. Never choose No merely because our backend receives text only. No microphone use occurs in this review. |
| Sharing | Do not assume every Google product is our processor. FCM customer-data processing is generally a service-provider use; Maps/Places also describe their own service-improvement purposes. Distinguish user-requested fulfillment/provider exceptions from SDK service data. Draft Shared for SDK identifiers/usage/diagnostics when no specific exception is documented. No-sale/no-ads is not a blanket no-sharing answer. |
| Optional / ephemeral | Notification permission does not stop automatic Firebase identifiers. DataStore-only age answers are local; no birth date is sent. Neither `store:false` nor a live response proves memory-only retention across providers. |
| Account creation | Draft Yes / Other for automatic customer/loyalty identity with scoped access, an explicit source-based classification rather than a claim of password/SSO/phone OTP login. A sign-up button's absence alone does not resolve account scope. Explain this in Other if the current form permits it; do not invent a login method. |
| Deletion | Draft Yes: My Details request path plus public `https://www.speedysweeties.ca/privacy-policy/#requests` and existing verified support recovery. Scope, 30-day target and justified financial/audit/provider retention are disclosed. Neither code/request creation nor real completion was tested here. |
| Marketing purposes | Resolved owner fact: service, receipts and loyalty only; no promotional follow-up/targeting. Leave Advertising or marketing unselected. Backend drafting capability alone does not change that answer. |

These are draft proposals, not final saved answers. Do not change forms, pause a
track, alter account classification or modify provider settings in this task.

## Remaining checks: two practical sessions, not a blanket submission hold

Existing evidence is reused: seven owner-reported version-5 device passes, Play
signer/update metadata, signature verification and full Linux regression CI. Do not
repeat Home/tab/hours/address/link checks merely because older reports list them.

| Item / classification | Smallest proposed session, environment and state/cost boundary |
| --- | --- |
| Voice notice — demonstrated defect in installed 5; merged repair | Session A, 10-15 min on Samsung SM-G990W2/API 36 after a future separately approved signed Play test build. Offline: inspect disclosure before permission, decline/back, denied microphone, typing, large text/TalkBack and restart. No new signed build or install now. Checking the repair before distributing it is justified; a universal device certification is not claimed. |
| Real Keystore and deletion races — additional device validation | Join Session A with a dedicated, isolated instrumentation/loopback fixture and test credentials, never real deletion credentials or live requests. Verify actual Keystore read/write across process restart/update and late fake callbacks. If no existing key/record exists, retained address is not evidence. Extra fixture preparation is needed; do not create a live code/request merely to seed it. No cloud/paid provider required. |
| Physical delivery / token rotation-removal / Maps — additional validation | Session B, about 10 min, separately authorized network window with an eligible existing ordinary owner order and valid app-held credentials, or an isolated fixture. Foreground/background/fresh-start taps; permission deny/re-enable; bounded token sync/reconnect and map. Token PUT/removal changes a backend association and needs that session's authorization. No generated order, push, dispatch status change or credential bypass. If no eligible order/event exists, defer physical delivery rather than manufacture one. |
| Voice provider/AI behavior — optional additional validation | Only if specifically needed, append one bounded synthetic speech/draft request to Session B after agreeing to provider processing/cost. Existing Google/OpenAI/mobile-data billing can apply; do not assume zero cost or call it under this task. Cancellation cannot recall already transmitted content. |
| Accurate Data safety/deletion entries — store requirement for applicable non-Internal distribution | Read current forms/tracks and reconcile the worksheet. Saving/submission needs separate authorization. Internal testing exemption does not remove general privacy/security duties. |
| Accessible privacy resource and Android coverage — store requirement / demonstrated wording gap | Review the focused website preview for later publication; existing link opens. Keep the logo as a separate presentation investigation unless it prevents policy access. No rebuild of submitted iOS or backend rollout repeat. |

No new paid infrastructure is proposed. Real Keystore continuity, physical
notification delivery, token rotation/removal, end-to-end deletion and final
signed-release/disclosure device behavior remain unperformed. They are validation
gaps, not automatically proof of an app defect or independent Play submission ban.

## Official evidence

- [Play Data safety scope, categories and exceptions](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en), including Internal-only exemption.
- [App account definition and deletion paths](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).
- [RecognizerIntent remote recognition](https://developer.android.com/reference/android/speech/RecognizerIntent#ACTION_RECOGNIZE_SPEECH).
- [Maps SDK disclosures](https://developers.google.com/maps/documentation/android-sdk/play-data-disclosure) and [Places SDK disclosures](https://developers.google.com/maps/documentation/places/android-sdk/play-data-disclosure).
- [Firebase SDK disclosures](https://firebase.google.com/docs/android/play-data-disclosure) and [privacy/processing roles](https://firebase.google.com/support/privacy).
- [Google controller terms](https://business.safety.google/controllerterms/) describe legal roles; those roles alone do not decide a Play sharing exception.
- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data); no special retention setting is assumed from `store:false`.
