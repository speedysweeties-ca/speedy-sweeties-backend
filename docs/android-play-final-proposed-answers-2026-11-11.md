# Final proposed Android Data safety answers — review only

November 11, 2026 (America/Toronto). This is one proposed answer set, not an import,
saved declaration or Google approval. No Console navigation question remains.

## Owner evidence and exact comparison

Current owner-exported `data_safety_export.csv`: SHA-256
`30df563c8f0be1c9820b7dc9dde6e2b8054b7ad536c440dfb442cb6425836709`.
All 782 data rows were compared using question ID + response ID. There are 40
populated answers (33 true, 7 false) and 742 blanks. The original CSV is preserved
outside Git. A blank is not an exported false, even where a control is unselected
or conditionally inapplicable.

The final proposal changes 106 cells: 103 blank cells receive explicit proposed
answers and three selected cells are cleared to blank. The other 676 cells are
unchanged, including 37 of the 40 saved answers. The three clears are account
creation None and the two location Optional choices, replaced by Other and
Required respectively. No existing explicit false is silently reinterpreted.
All 782 rows, every current raw value, every proposed raw value and reasons are
in the owner's durable `ALL_782_ROWS_REVIEW_ONLY.csv`/JSON ledger. It deliberately
uses a review schema, not Google's import schema. Changes-only and saved-40-row
views accompany it. No declaration has been imported, entered, saved or submitted.

Owner confirmation: **service, receipts and loyalty only; no promotional follow-up
or targeting**. Advertising or marketing is unselected throughout. Backend draft
generation capability does not establish actual promotional use. That business
question is resolved and must not be asked again from older worksheet text.

## Account classification: select Other

Replace exported `PSL_ACM_NONE=true` with `PSL_ACM_OTHER=true`; clear None to blank.
This recommendation applies Google's user-facing identity definition to actual
behavior, not merely to a database table or the absence of a sign-up button.

`src/utils/customerIdentity.ts` uses normalized phone as canonical customer identity.
`src/controllers/order.controller.ts` reuses or creates that persistent Customer,
links orders/rewards to it, then issues `signCustomerLoyaltyToken(customerId)`.
`src/utils/jwt.ts` binds that credential's subject to the Customer with customer-
loyalty scope and 365-day expiry. `customer.controller.ts` returns that customer's
persistent loyalty snapshot. Android exposes this balance to the customer and binds
saved access to the matching profile. The same customer/loyalty identity is used
across ordinary orders and native clients; it is more than a temporary order ID.

Therefore propose **automatic customer/loyalty account creation (Other)**. This is
our reasoned classification under Google's definition, not a claim that Google has
already adjudicated it. Do not invent password, OAuth or general email/phone OTP
sign-in. Privacy email verification is for deletion access, not general login.
Keep `PSL_HAS_OUTSIDE_APP_ACCOUNTS=false`: the app does not offer an outside-account
login/import route; an order matching an existing customer is not such a login UI.
Keep all outside-account-method cells blank.

`PSL_ACM_SPECIFY` proposed text:

> When ordering, a customer identity is created or matched from the phone number. Loyalty persists across orders/apps; access uses scoped order/loyalty tokens. No password/social sign-in. Email verification is only for deletion.

## Top-level and deletion answers

| Export field | Current raw evidence | Final proposal / reason |
| --- | --- | --- |
| `PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA` | true | Keep true. App/backend/SDK data leaves the device. |
| `PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT` | true | Keep true for inspected app-controlled HTTPS API/SDK traffic. No cleartext allowed. This is not a packet capture or guarantee of every external recognizer's independent transport. Google's encryption guidance distinguishes app-to-server standards from user transfers to external services. |
| Account methods | None true; all alternatives blank | Other true; None blank; password/other-auth/OAuth alternatives stay blank. |
| `PSL_ACCOUNT_DELETION_URL` | blank | Set `https://www.speedysweeties.ca/privacy-policy/#requests`. |
| `PSL_SUPPORT_DATA_DELETION_BY_USER` | Yes, No and automatic-deletion options all blank | Select `DATA_DELETION_YES=true`; other choices stay blank. The prior answer was unanswered, not No. |
| `PSL_DATA_DELETION_URL` | blank | Set the same existing public request URL. |
| Outside-app accounts | false | Keep explicit false for the absent external-login feature. |
| Families / independent validation / UPI badges | all blank | Keep blank/unasserted. Do not invent saved false values or certifications. |

The existing public requests/contact section permits a request without a new order
or reinstall and explains ownership review. Native current code also offers My
Details -> Request account deletion and authenticated status/cancel. No new code,
request or email was generated to prepare these answers. No instant/automatic
erasure claim: normal target 30 calendar days after verification, justified restricted
financial evidence generally six years after the relevant tax year, holds, minimized
audit evidence and provider/backup outcomes remain disclosed. Status-only credentials
may remain solely to authenticate request status/retention details. Phone verification
is disabled; ordinary phone data collection does not mean SMS inbox access.

## Data types and handling: one final matrix

C = Collected; S = Shared under Play's definition after applicable exceptions.
F = App functionality; A = Analytics; Sec = Fraud prevention/security/compliance;
Acct = Account management. **All selected types: ephemeral = false.** This means
no blanket memory-only claim, not that every recipient stores every field forever.
All purposes not listed remain unselected/blank, especially Marketing.

| Type (response ID) | C/S | Control | Collection purposes | Sharing purposes |
| --- | --- | --- | --- | --- |
| Name (`PSL_NAME`) | C | Required | F, Sec, Acct | — |
| Email (`PSL_EMAIL`) | C | Required | F, Sec, Acct | — |
| Phone (`PSL_PHONE`) | C | Required | F, Sec, Acct | — |
| Address (`PSL_ADDRESS`) | C + S | Required | F, A, Sec, Acct | F, A |
| User IDs (`PSL_USER_ACCOUNT`) | C | Required | F, A, Sec, Acct | — |
| Purchase history (`PSL_PURCHASE_HISTORY`) | C | Required | F, A, Sec | — |
| Approximate location (`PSL_APPROX_LOCATION`) | C + S | Required | F, A, Sec | F, A |
| Precise location (`PSL_PRECISE_LOCATION`) | C + S | Required | F, A, Sec | F, A |
| In-app search history (`PSL_IN_APP_SEARCH_HISTORY`) | C + S | Required | F, A | F, A |
| Other user content (`PSL_USER_GENERATED_CONTENT`) | C | Optional | F | — |
| Other in-app messages (`PSL_OTHER_MESSAGES`) | C | Optional | F | — |
| Health info (`PSL_HEALTH`) | C | Optional | F | — |
| Voice/sound recordings (`PSL_AUDIO`) | C | Optional | F | — |
| Device/other IDs (`PSL_DEVICE_ID`) | C + S | Required | F, A | F, A |
| Crash logs (`PSL_CRASH_LOGS`) | C + S | Required | F, A | F, A |
| Diagnostics (`PSL_PERFORMANCE_DIAGNOSTICS`) | C + S | Required | F, A | F, A |
| App interactions (`PSL_USER_INTERACTION`) | C + S | Optional | F, A | F, A |

Keep all 20 remaining data-type choices unselected/blank and their conditional
handling blank. In particular, payment-method choice/receipts are transaction
information, not card/bank-account number collection; the app does not read contact
lists, inbox/SMS, files/photos, fitness/Health Connect, installed-app lists or web
browsing history. Local 19+ answers are not a transmitted birth date. Free text alone
does not justify declaring every unrelated sensitive category.

Why these changes from the export/earlier worksheet:

- User ID, order history and user-content handling were blank despite actual
  persistent loyalty/order/draft flows. Operational reports justify purchase/ID
  analytics; owner-confirmed service/loyalty use does not imply promotional targeting.
- Sweetie user/assistant turns and clarification history are conversation messages,
  represented separately as Other in-app messages. Notes/instructions remain Other
  user-generated content; this does not imply reading the customer's email or SMS.
- Handset GPS assistance is optional, but a confirmed order requires city/civic
  address and authoritative server geocoding. The retained delivery location is
  still collected without GPS permission. Required in the aggregate form does not
  make the Android fine/coarse permission mandatory.
- `OrderItemCard` launches a catalogue query when item text has at least two
  characters, including programmatic changes. Address editing launches Places
  queries; there is no general per-query opt-out. Do not describe automatic entry
  traffic as an optional search button. These types were understated as Optional
  in the earlier worksheet.
- Firebase Installations/FCM and Maps/Places collect identifiers/SDK metadata. Maps/
  Places document automatic crash and diagnostic information. Denying notification
  display is not an opt-out from all of that collection. No Firebase Analytics or
  Crashlytics product SDK was found; vendor SDK metrics still count.
- Map-interaction telemetry is conditional on optional tracking-map use. Custom
  Places dropdowns are not proof that Places Autocomplete widget events occur.
- Prescription/health-related pickup instructions are optional supported content;
  this does not assert a medical-record/fitness integration.

### Provider sharing and voice: resolved proposal, not blanket exceptions

Render/Resend/OpenAI processing on our instructions and assigned-driver service
processing are treated as service-provider transfers. Retailer/driver information
needed for the requested purchase/delivery also falls within the user-requested
fulfillment context. These exceptions do not mean no recipient receives data.

Google Maps/Places describe SDK collection to provide **and improve Google
services**. Do not apply Firebase's general customer-data processor role to all
Google products or all service data. The proposal therefore includes Shared for
SDK identifiers/usage/diagnostics and address/location/search context reaching
those services, rather than keeping an unsupported blanket no-sharing label.
Legal controller terminology is supporting evidence, not itself the Play test.

Audio is included as optional recognizer-assisted processing because Android's
external recognition activity may stream it remotely. Our app receives text, not
an audio file; microphone permission alone is not a recording/upload implementation.
For the deliberate Speak action to the selected external recognizer, apply Play's
specific user-initiated-transfer exception to sharing. Do not use that exception to
hide automatic Maps/Places telemetry or later backend text/history/cart processing.
The latter is collected and processed by backend/OpenAI on our behalf. `store:false`
is not zero retention and cannot justify ephemeral=true. This proposal does not
claim Speedy Sweeties stores microphone audio or that all recognizers stay on-device.

The intended Android release inherits PR #15's agreement before permission/
recognition; older installed versions' text-only notice remains a known wording
gap. The new agreement is not retroactive evidence that old clients obtained it.

## Applicable versions and intended release

| Version evidence | Scope used for this proposal |
| --- | --- |
| 1.0 (4), last owner Console production evidence | Include ordinary customer, order/receipt, loyalty, location/Google SDK and voice flows. Original source/old installed-app evidence is reused; no new live test. |
| 1.0 (2), last owner Console closed-alpha evidence | Include while distributed on a closed track; do not assume a newer Internal build supersedes it. No binary/source attestation is invented for this historical artifact. The aggregate proposal covers known common backend/SDK flows; no new marketing purpose is inferred. |
| Play-installed 1.0 (5) | Independently confirmed package/signer/non-debuggable/Play installer and seven owner device passes. Distribution track beyond the handset is not encoded in this CSV. Internal-only artifacts are exempt from inclusion in the public Data safety section. |
| Intended next source | Inherits merged PR #15 at `58dd9cb37dc8deebb710ab8777ff93d1f3a7e687`; proposed version code 6 is a metadata-only preparation, not verified reserved/unused. It adds no new data flow beyond the reviewed fixes. |

The CSV is current form evidence, **not** an active-version or version-code inventory.
Do not call the old track screenshots a fresh inventory or claim code 6 is available
from this export. The proposal uses the union for applicable distributed clients
and the intended release, rather than narrowing to Internal testing. Before actual
signing/upload or declaration submission, recheck code availability and active
tracks. No current-form navigation gap is reopened and no business question remains.

An older distributed client without an in-app deletion path does not acquire one
merely because the form is updated. The intended release has the current path;
coordinate any still-distributed older closed/production versions before public
rollout. No track is changed or paused here. The universally accessible public
request resource supports older users without generating an order for recovery.

## Continuation and preserved boundaries

Website PR #138 remains an unmerged Android-policy preview. Its proposed business
wording now reflects the owner's no-promotion confirmation; the approved/published
policy and historical hashes stay untouched. No logo fix is added without browser
reproduction, and the report is not a release blocker unless access is prevented.

Android PR #16 prepares only versionCode 5 -> 6 on an isolated branch. Do not sign,
merge, upload, install or reuse the signed version-5 artifact for this different
source. Reuse completed source/CI/device evidence; current-head CI is normal review
validation of the metadata candidate. The existing two-session plan remains, with
physical delivery, token rotation/removal, real Keystore, end-to-end deletion and
final signed/disclosure validation unperformed additional validation, not automatic
submission bans. No new infrastructure/provider calls or credentials are proposed.

## Primary references and limits

- [Google's app-account definition and deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).
- [Play types, purposes, optionality, sharing exceptions and Internal-only scope](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).
- [RecognizerIntent remote processing](https://developer.android.com/reference/android/speech/RecognizerIntent#ACTION_RECOGNIZE_SPEECH).
- [Maps](https://developers.google.com/maps/documentation/android-sdk/play-data-disclosure), [Places](https://developers.google.com/maps/documentation/places/android-sdk/play-data-disclosure), [Firebase](https://firebase.google.com/docs/android/play-data-disclosure) disclosure guidance and [Firebase roles](https://firebase.google.com/support/privacy).
- [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

Vendor pages describe current SDKs; they are not independent packet captures of
each older pinned binary or provider-account setting. Source paths, owner evidence
and explicit interpretations above support the proposed set. This review is not a
special provider retention approval or external security certification.
