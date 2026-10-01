# ChatGPT ordering staging — not production

This branch adds a narrow test gateway around the existing compiled `createOrderController` and `createOrderSchema`. Production source files and the main branch are unchanged. No live order has been submitted by this work.

## Deployment

Apply the root `render.yaml` from branch `chatgpt-ordering-staging` using [Deploy to Render](https://render.com/deploy?repo=https://github.com/speedysweeties-ca/speedy-sweeties-backend/tree/chatgpt-ordering-staging). It creates only `speedy-ordering-staging`, on the free plan in Ohio, with automatic deploys off. It references the already-created separate database `speedy-ordering-staging-db` (`dpg-davbqnhsrm7s73bd3uq0-a`); it does not declare or change production services. That free database expires **2026-10-31**. Free web services can sleep; do not use this for customers.

The connected Render tools cannot retrieve the new connection string or create a fromDatabase binding. Apply the Blueprint in Render so it supplies that connection internally. Do not paste database passwords into chat. After the service is live, the assistant can rotate a new shared test key into the service and private Site through their environment-variable tools, without copying a secret through chat.

## Isolation

The startup guard runs before migrations and imports. It accepts only the new staging database ID/name/user, NODE_ENV=test, an empty Firebase service account, disabled auto-dispatch, and no provider API keys. It rejects a local .env file. The service imports the existing order controller, not the regular server or its background jobs. Firebase uses the existing test stub; external fetch calls are disabled. Only the two fixed synthetic dispatcher/driver identities are permitted; their password fields cannot be used to log in. Any other account, credential, notification token or location causes the guard to refuse operation. Only health, catalogue, test-order submission/status and an authenticated aggregate verification route are mounted. Data endpoints need a bearer key; no public production order/auth/notification endpoints are mounted.

The four item IDs/names are an explicit convenience snapshot read on 2026-10-01. Classification alone is insufficient: the production CONVENIENCE category also contains restricted items. No free-form item names, notes, address or contact fields are accepted. The server constructs a clearly synthetic customer and address. No customers, drivers, tokens or credentials are copied from production.

The real backend needs numeric amount fields but its catalogue has no price/inventory fields and no authoritative fee quote endpoint was found. Zeroes in synthetic requests are **unknown-price placeholders**, never a free offer. The API exposes `pricing_verified:false` and no quoted total. Business hours and geocoding are not verified in staging.

## Fresh database schema repair

The first Render deployment passed all builds/tests and applied all 36 historical migrations, then failed because the historical migration chain does not reconstruct the current Prisma model (first observed missing field: ItemCatalog.source). The staging bootstrap now prepares the canonical Prisma schema in `ordering_staging_v1`, a fresh namespace within the same pinned staging database, before loading the controller. The existing public schema is left intact. No reset, force flag, or accept-data-loss option is used. Production migrations and production services are unchanged. The shared key protects `/verification/:request_key`, which reports aggregate test-only database assertions without customer values or credentials.

## Request safety

`POST /orders` accepts `{request_key:<UUID>,items:[{product_id:<allowlisted UUID>,quantity:1..20}]}`. At most 40 units, no duplicates or extra fields. A durable SystemSetting reservation records the payload hash before invoking the real controller. Successful retries return the same order. Changed payloads conflict. Ambiguous outcomes remain pending and require reconciliation; the gateway never replays the controller after a reservation. Use the same request key, never a new one to bypass a pending submission.

`GET /orders/:request_key` reads a completed test request. Responses omit tracking tokens, loyalty tokens and customer data. A resulting PLACED order represents a row in the isolated backend queue, **not driver assignment or delivery**. New orders now support the controller workflow below. Actual dispatcher and mobile UI integration remains a later milestone.

## Verification and remaining checks

Run `npx prisma generate && npm run build && node --test staging/test.cjs`. Tests cover guards, allowed input, authentication, concurrency, retries, token filtering and uncertain results using a test database adapter. They do not prove a deployed PostgreSQL/controller round trip. After Blueprint deployment: verify health, configure private Site environment variables, submit a synthetic checkout, verify exactly one database row, read status and check no assigned driver or FCM token. Keep the public/live release disabled.

## Simulator and published reference rates (2026-10-01)

`POST /orders/:request_key/simulate` takes only an `action` from dispatch, accept, out_for_delivery, deliver, cancel. The checkout's UUID request key is required, not the backend Order.id. The route requires the shared staging key and a complete reservation; it validates exact synthetic contact/attribution fields and no real assigned driver. A transaction locks that one order before updating the status and any fictional driver record. Repeated requests for the same current target are idempotent; skipped stages and backward transitions conflict. The fictional driver is a SystemSetting record; legacy orders use no assigned User account. `/verification` distinguishes actual assigned drivers (zero) from synthetic driver assignments.

This legacy route is a status simulator around persisted staging orders. It does not call the production assignment/driver/receipt controllers and does not verify their permissions, push notifications, receipt rules or driver app integration. Those require a separate integration milestone before live use.

`/catalog` includes `published_rates` from `published-rates.json`, a dated snapshot of the public website. `delivery_fee` and `total` remain null because no order-specific quote was computed. The published figures must not be treated as confirmed stock, item prices, a final amount due, or payment authorization.

Fifteen backend tests pass, including concurrency, strict simulator input and isolation rejection. Earlier hosted test #3 reached DELIVERED via direct backend requests; website-specific reference wiring is tested separately in the private Site.


## Controller workflow — current phase

New submissions are tagged `controller-test-v1`. `POST /orders/:request_key/workflow` accepts only the same five action names. The adapter calls unchanged compiled `assignDriverToOrderController`, `driverActionController`, `createOrUpdateReceiptController`, and staff cancellation. It never sets operational status itself. A durable per-order claim excludes concurrent actions across instances and remains pending if a controller throws or its outcome is uncertain. Repeated completed actions return the current status; backward or skipped steps fail. Legacy `/simulate` is rejected for these orders.

The database contains exactly two synthetic staff rows: `staging-dispatcher-1` (DISPATCHER) and `staging-driver-1` (DRIVER), with example.invalid emails, unusable password hashes, no FCM tokens and no coordinates. No staff authentication endpoint is mounted. Requests cannot choose staff identities or receipt amounts. Exact synthetic customer/contact, attribution, assigned-driver and catalogue checks precede every controller call. The driver heartbeat is refreshed internally solely for the assignment controller's freshness rule.

Saving the sample receipt invokes the real assigned-driver receipt controller; it persists a DigitalReceipt and moves ACCEPTED to OUT_FOR_DELIVERY. Amounts are fixed fictional fixtures: $1 per item unit, $2 delivery, $0.50 fees; they are unrelated to published rates, quotes, actual tax or payment. The driver-action controller then enforces its receipt requirement for DELIVERED. The response exposes only labelled sample receipt components and safe test status.

Verification now reports staff isolation, real staging assignment/event counts, dispatcher attribution, receipt authorship and lifecycle timestamps. Controller adapter unit tests use injected spies; hosted verification exercises the actual compiled controllers and PostgreSQL. This does not validate dispatcher browser UI, driver app login/screens, actual staff authorization middleware, push notifications, live payment, real location routing, or live rollout.
