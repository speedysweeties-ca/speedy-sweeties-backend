# Customer order notification contract — review only, November 10, 2026

Backend baseline: `d0d124198d513de6e97aff70acfd37690fc8a51e`. Android PR #12
was reviewed at `840b7b5d09c9c6b7450db3a29170ebb93412b1b0` (full CI 71/72,
no submitted reviews/threads) and normally merged with that exact-head guard as
`e67b200474a0afda923129147ab1ee2eb340d195`, without protection bypass.
Its Android UUID-only tracking retirement deliberately makes credentialless saved
orders unavailable after upgrade; stored opaque tokens still migrate. Older
installed clients retain the unchanged backend legacy route. No credential is
recovered through an order, phone/email lookup, privacy token or a weaker route.

## Authentication and mutation

New routes under `/api/v1/customer-notifications`:

- `GET /orders/:id/token` returns `{success:true,data:{revision,registered,orderReference}}`.
- `PUT /orders/:id/token` accepts only `{expectedRevision,operationId,fcmToken}`.
  `operationId` is a UUID; `fcmToken` is a nonempty, bounded, control/whitespace-free
  device token, or explicit `null` to remove the association.
- Both require `Authorization: Bearer <existing opaque order tracking token>`.
  This random 32-byte order credential already authorizes order-scoped customer
  check-in/help actions. The new grant controls only that same order's single
  notification destination. It cannot choose a different order/customer, read a
  device token, renew access, send a message or authorize staff operations.
- The hashed credential must match the path order, be unexpired (normal creation
  grants 48 hours), and not be revoked or privacy-erased. IDs, phone/email alone,
  loyalty/staff JWTs and privacy credentials never qualify. There is no exchange
  or renewal endpoint. The unauthenticated `/notifications/fcm-token` stub is
  unchanged and is never used by this flow.
- Rejected access is generic HTTP 401 / `CUSTOMER_ORDER_ACCESS_REJECTED`.
  Unknown/wrong/deleted orders do not disclose existence. Responses use no-store;
  raw tokens, credentials, customer fields and provider errors are not returned.
  IP rate limit: 60 requests per 15 minutes. Invalid input is 400; internal failure
  is a generic 503. A missing route on an older backend is unsupported, not an
  invitation to use another authentication method.

Additive Order columns `fcmTokenRevision` (default zero) and
`fcmTokenMutationId` (nullable) implement optimistic concurrency and lost-response
recovery. A transaction locks the Order row and checks credentials/expiry again
after the lock wait. A new operation must match the revision and increments it,
including removal of an already empty association. Replaying the latest operation
with identical contents returns its acknowledgement without another write;
reusing that operation ID with other contents conflicts. Stale revisions return
409 `NOTIFICATION_REVISION_CONFLICT`; closed orders reject replacement with
`NOTIFICATION_ORDER_CLOSED`, while still permitting authenticated removal.

One destination per order is preserved. Concurrent devices do not create fanout;
one revision wins, and a loser must read current state before a deliberate current
intent can retry. Clients must discard superseded intents and bound retries.
Registration means an association was stored, not that a device received a push.

Deletion's existing transaction clears the token and mutation ID, increments the
revision and clears tracking authorization. If mutation wins first, erasure
subsequently removes it. If erasure or credential revocation wins first, a waiting
mutation fails authorization. Neither retries nor late replies can reattach it.
Provider invalid-token cleanup compares the exact failed token and cannot clear a
concurrent replacement. Tracking expiry/revocation rejects mutations; it does not
extend or manufacture a credential. Existing legacy notification associations
and older client protocols are not converted into new access grants.

## Notification payload and queued-message limits

Actual customer OUT_FOR_DELIVERY and loyalty emitters use one sender. It reads the
current order association/deletion state immediately before each attempt. Driver
notifications are unchanged. No application send retry/outbox or new service is
introduced. Removed/erased/closed-inappropriate/expired events are skipped.

The existing notification+data envelope, type and Android channel are retained.
Bodies are generic; no amount, address, name, phone/email, item description or
access/tracking credential is included. New data strings are `orderReference` (a
non-secret `nr1_` routing reference), `notificationSchema: "1"`, `eventId`, `occurredAtMillis`
and `expiresAtMillis`. The reference and event identity are domain-separated HMAC-SHA-256 values using the existing server JWT key and persisted order/event facts. Neither is accepted for authentication or legacy UUID tracking. The actual UUID is a legacy access capability and is never included in customer notifications. Android matches the reference through authenticated metadata for its own held order; there is no public reference-to-order lookup. A separate JWT-key rotation changes references: previously queued unmatched hints become unavailable safely until metadata is refreshed. Retries do not refresh identity or age.
Status remains a routing hint, never an authoritative client status update.

Expiry is 15 minutes after the persisted event. Android TTL, notification tag,
collapse key, APNs expiration and collapse ID use that same event/window. Clients
must check freshness themselves and fetch through app-held authorization. These
limits reduce stale delivery; they are not a recall guarantee. A send already
accepted by FCM/APNs, queued by a provider, in flight, or displayed by an OS can
outlive deletion/removal. A deletion between the final read and provider acceptance
cannot be atomically cancelled across PostgreSQL and FCM. No promise of universal
retraction is made. New Android code suppresses its own deleted-generation work
and authenticates taps; generic content limits disclosure from old remote alerts.

## Compatibility, rollout and rollback

No existing order/tracking/loyalty/privacy endpoint or driver payload is removed.
New fields are additive. Existing notification type/channel/envelope continue;
private receipt totals move out of notification content into existing tracking
responses. The owner-supplied original-Mac investigation now associates submitted
iOS 1.0 Build 5 with exact source `f4704086e3f6aac519ed9f2e507f91d1398c2848`:
all 64 source hashes and the complete path manifest matched, with no uncommitted
source included; Build 5 was a command-line override. This is owner-supplied Mac
evidence, not independent inspection of the archive/IPA by this reviewer.

Independent review of that exact Git source confirms existing creation, tracking,
loyalty and notification handling remain source-compatible. Build 5 does not
implement the new token API or Android routing, and no iOS rebuild is required
merely to add that feature. Alert text is deliberately generic and event lifetime
bounded; physical-device delivery remains unverified. See the
[compatibility review, provenance filenames and coordinated execution plan](customer-notification-compatibility-review.md).

The November 6 PREPARE_FOR_SUBMISSION records predate the later owner/VS Code
reported November 9 10:27 p.m. EST submission and Waiting for Review closeout.
They do not establish failure of that later submission or authorize resubmission.
No ASC inspection/change or new device pass is claimed.

Review PR bodies cross-link exact backend/Android candidates and final CI. Nothing
in these PRs is deployed or merged under this task. Future authorized order:

1. Preserve existing revocation records; apply the two-column additive migration
   and reviewed backend together using the existing release procedure.
2. Verify that exact backend in an authorized isolated device environment, then
   release the matching Android revision separately. An Android-first rollout
   must remain visibly unsupported against the old backend, with no fallback.
3. Retain columns on code rollback. Rollback must preserve the earlier targeted
   revocation consumers/tombstones; never use code predating those safeguards.
   Android rollback loses synchronization/new freshness parsing. Backend rollback
   loses this API and generic/event-fenced sending; it cannot recall already sent
   messages and is not a safe substitute for deletion or revocation. Prefer a
   reviewed forward fix. No destructive down migration is included.

## Validation and device plan

Unit/route tests use fake messaging and synthetic records. Required PostgreSQL CI
tests exercise real row-lock waits, concurrent writers, replay, removal, expiry,
revocation and both deletion orderings on a separately named loopback database.
The pinned historical privacy baseline additionally executes the additive migration
and full fulfillment regression checks cleared notification metadata and denied
late reattachment. Existing loyalty/state-machine/driver suites remain required.
Dispatcher help re-reviewed: `order-lifecycle`, `privacy-requests`; staff controls
and roles stay unchanged. Example questions: "How do I know the customer saw an
order update?" and "Can deletion recall a notification already on a phone?"

After separate authorization for an isolated environment/device delivery: test
permission grant/denial, token rotation, foreground/background/terminated taps,
restart/lost response, duplicate/expired/unrelated messages, concurrent devices,
offline recovery and deletion while a send/sync is in flight. Confirm Home/age
gating and no credential in notification/logs. Actual-device delivery, real
Keystore, signed-release and Android disclosure checks remain outstanding.
No paid infrastructure, production environment change, real notification,
live order/deletion request or Apple allowance use is part of this validation.
Notification synchronization is not complete until both revisions are integrated
and verified together; isolated checks do not establish production/device delivery.

## Original-Mac provenance investigation: completed

The owner supplied its result; the previous request to locate Build 5 is completed.
The source/archive association, precise filenames, submission chronology,
independent source review and remaining device checks are recorded in the
[coordinated compatibility review](customer-notification-compatibility-review.md).
Do not reopen provenance or submission merely from older preparation records.
