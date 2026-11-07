# Protected synthetic ordering — local proposal, not deployed

This is a visible safety feature in the normal Release app, available to any
operator-enrolled synthetic profile. It is not an authentication bypass or a
reviewer-only category filter. All categories, normal address checks and normal
tracking/loyalty/privacy credentials remain. No demo login or fake ownership
attestation is introduced.

## Owner administration

Existing authenticated ADMIN plus the singleton PRIVACY_ADMIN_USER_IDS may POST
`/api/v1/orders/synthetic-safety/enroll` with `ownerConfirmedSynthetic: true`,
`profile` (the exact approved synthetic name, phone, email, civic address, city,
province and optional unit/buzz), `expiresAt`, `maxOrders` (1–6), `maxEmails` (1–3).
Expiry must be within seven days. This narrow implementation enrolls only the
already approved speedysweeties@hotmail.com destination; a different mailbox
requires a reviewed successor, not a silent input change. Enter contacts privately, not in Git/arguments/
logs. Enrollment refuses any existing policy or matching Customer phone/email.
It creates only a hashed SystemSetting reservation; it does not invent historical
ownership or an email-verified flag. Existing normal code verification proves
control of that contact, not ownership of other people's historical records.

Enroll only after a private read-only collision/fixture inspection, operator
confirmation of a synthetic profile with an owner-authorized routable address and
phone, and separate live provisioning authorization. Do not reuse a real customer.
Use the existing approved mailbox and staff availability; do not obtain a new
provider credential or alter account settings for this proposal.

## Normal app flow

Account → Protected test ordering ON. Enter the exact privately supplied synthetic
profile. Inspect all products, type/edit the cart and submit once. The service uses
`POST /api/v1/orders/synthetic`; a missing route, mismatch, expiry, exhausted budget
or unsafe response stops. There is no fallback or retry to ordinary `/orders`.
The normal order-creation transaction creates the Customer/Order/OrderItem records,
then sets CANCELLED, a truthful no-purchase/no-delivery reason, and clears driver/
push fields BEFORE commit. No automatic dispatch or customer/driver push call is
made. Items do not write the shared catalogue. The Customer is SMS-marketing-opted
out. Existing terminal-state guards prevent dispatch/delivery transitions.
The same registered contact is protected on the ordinary order route if the
switch is accidentally off; unrelated customers retain ordinary behavior.
External gateway callbacks are refused for this synthetic profile.

The response gives the normal tracking and loyalty credentials. The existing app
stores them normally in Keychain. A normal email challenge gives the selected
mailbox a fresh 10-minute code, with five verification attempts. Each committed
challenge consumes the email budget before the provider call, including failed or
unknown delivery. SMS is refused for the enrolled subject. No automatic resend.
This safety feature does not enable any privacy gate, bypass journal/retention/
fulfillment guards or grant administrator access. Cancellation is not delivery or
a financial transaction. No receipt or fake delivery status is fabricated.

## Observation and closure

Private read-only pre/post counts: exact synthetic Customer and CANCELLED Orders,
items, assignedDriver=null, FCM=null, receipts/dispatch events/pickup stops=0,
no loyalty reward/progress, SMS opt-out, exact policy usage. No customer rows in
logs. An unexpected assignment, receipt, unrelated contact, registry change,
provider outcome or source revision stops execution; do not retry blindly.

Owner POST `/api/v1/orders/synthetic-safety/close` marks CLOSED permanently; expiry
also refuses new test orders/emails. Do not delete the reservation or downgrade to
a server without this safety while access remains possible. Leaving the app switch
ON preserves fail-closed routing even if the endpoint is unavailable. Existing
issued privacy/status credentials still follow ordinary expiry/revocation rules;
closing enrollment is not deletion or automatic credential revocation.

The minimized HMAC reservation remains personal-data-related safety state, not
anonymous proof. Its purpose, retention/review and any later decommission require
a case disposition alongside Customer/Order, journal, logs, address provider,
Resend and mailbox/device copies actually created. Do not claim erasure from a
cancelled request. No general backup-erasure promise is added.

## Review limits

All test purchases are suppressed, so this proves order entry/credential creation
and cancelled tracking, not purchasing, driver progress or physical delivery.
Disclose that restriction and all real product scope to Apple. Do not promise it
constitutes full review access without Apple's acceptance. Owner relay over private
App Review correspondence daily 22:00–00:00 Toronto is selected but not validated:
Apple's availability and handoff latency must support the existing ten-minute code
window. No static code, shared owner password or fictional D1–D3 declaration.

R1 remains paused. Its approved pins are not approval to deploy this successor.
No live enrollment, messages, cases, deployment, gate change or upload is authorized
by this document. Existing Health-containing IPA does not include these new sources.

## Review corrections — November 6 (local, not live)

The receipt endpoint now refuses the protected subject even for staff; a CANCELLED
status alone had not prevented administrators adding a receipt. Editing a normal
order into the enrolled contact is refused. The genuine lost-credential exception
cannot issue a synthetic reviewer grant; any already issued redemption also passes
the same destination-bound email budget before delivery. Client-supplied status,
limit or safety flags cannot modify the stored limits. A missing/changed/closed
policy never authorizes a protected endpoint call. A malformed policy fails closed;
operator repair is required, not fallback into a real delivery.

Protection is scoped: the normal public endpoint still accepts unrelated ordinary
customers. There is no authenticated reviewer identity that can follow someone
who deliberately omits protection and substitutes BOTH unrelated contacts. Do not
claim a global ban on ordinary orders from Apple's network/device. Reviewers must
keep the visible protection switch ON and use the exact supplied synthetic profile.
The protected endpoint rejects even a completely different profile. Blocking all
unrelated public customers would change the normal service and is outside this patch.

The Release app drops the FCM token from a protected payload without clearing the
stored token. It requires a successful CANCELLED response with order ID, tracking
and loyalty credentials. Cancelled confirmation states no purchase/delivery rather
than suggesting a delivery is on its way. There is no fallback or automatic retry.

## Fresh-code handoff — practical proposed successor, owner adoption pending

Use asynchronous private App Review correspondence ONLY to coordinate the call
before a code exists. During Robert's existing daily22:00–00:00 Toronto coverage,
the reviewer calls the already prepared reviewer-contact number. Robert confirms
the app is ready, stays on the call, and only THEN the reviewer taps Send code once.
Robert reads the existing mailbox and relays that single fresh code on the call;
the reviewer enters it immediately. Keep the ordinary ten-minute/five-attempt
limits, exact destination and explicit customer confirmation. No shared mailbox
password, static OTP, new secret, expiry extension or fictional ownership assertion.
Never put codes in PRs, source, logs or public notes. Do not record the call/code.
A proposed operational target is receipt/relay/entry within two minutes; stop at the
existing expiry or an unknown delivery outcome. No automatic resend. Proposed
budgets and dates are not live approvals and do not start at merge/deployment.

This removes dependence on Apple's asynchronous correspondence delivering an OTP
within ten minutes, but does not prove Apple will agree to call or review during
those hours. Confirm Robert adopts the live-call channel, then request coordination
only in the later authorized review submission/communications. A local timed phone
rehearsal verifies the operator flow only. Actual reviewer availability/full access
remain unverified until observed. If Apple cannot coordinate, stop and agree an
alternative direct reviewer-controlled recipient for a NEW synthetic profile through
normal authentication before claiming readiness; the current hard-bound mailbox
cannot be silently replaced. No such mailbox/provider provisioning is authorized now.

Full ordering scope remains disclosed, including tobacco and voice. These safe
cancelled orders demonstrate entry/credentials/cancellation, not paid purchases,
receipts or physical delivery. Any later completion review uses a separately scoped
active request and ordinary fulfillment/copy rules. Intake alone is not deletion.

## Final lock/expiry review — November 6

Ordinary-order edits share the enrollment transaction lock even when no policy yet
exists. If an edit wins, it commits its customer before enrollment checks collisions;
if enrollment wins, the edit sees the reservation and refuses. Requests waiting for
that lock recheck the current time before accepting an order, email claim or new
enrollment. A timestamp captured before waiting cannot extend the approved period.
Already accepted/committed email claims may still finish their bounded provider call
after closure/expiry; they remain counted, and an unknown outcome must not be retried.

The live-call channel is owner-approved for inclusion in held instructions. This
approves the preparation choice only. Apple coordination, a successful handoff and
any live call/email/case remain unverified/unexecuted. Prior pending-adoption wording
is historical; it does not request that decision again.
