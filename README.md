# Speedy Sweeties Backend

Production API for the Speedy Sweeties delivery operation. It is built with Node.js, TypeScript, Express, Prisma, PostgreSQL, and Firebase Admin.

The API is consumed by the Customer Android app, Driver Android app, and Dispatcher web app.

## What it supports

- Customer order creation, item search, business status, and public order tracking
- Dispatcher/staff order management, driver assignment, priority, catalog, customer, pickup-location, and checklist management
- Driver presence, heartbeat/location updates, assigned-order workflow, and digital receipts
- Customer loyalty progress and retention data
- Firebase notification delivery and QR campaign statistics

## Roles and order workflow

Roles are `ADMIN`, `DISPATCHER`, and `DRIVER`. Staff/dispatch performs assignment and internal order management. Drivers use the constrained `driver-action` workflow rather than the generic staff status endpoint.

The normal lifecycle is:

```text
PLACED → DISPATCHED → ACCEPTED → OUT_FOR_DELIVERY → DELIVERED

Delivery destinations are normalized, verified, and stored by the backend for use
by dispatcher and driver clients. See `docs/delivery-location.md` for configuration,
failure policy, and the optional dry-run backfill.

Delivery-address verification currently has no distance-radius restriction. It
continues to require a consistent Canadian, Ontario civic address.
```

An order can be `CANCELLED` where appropriate. Driver-created digital receipts are the authoritative final-total record; client-estimated values are not authoritative.

## Security and compatibility notes

- JWT authentication and role-based access control protect staff and driver routes.
- Public order creation, tracking, loyalty, notification registration, and item search are rate limited.
- `GET /api/v1/orders/track-token/:token` supports opaque tracking credentials.
- `GET /api/v1/orders/track/:id` is retained temporarily for compatibility with older Customer Android releases.
- `GET /api/v1/customers/loyalty-token` is the token-based loyalty lookup. The legacy public loyalty lookup remains temporarily for compatibility.
- Drivers are considered stale/offline for dispatch and public tracking after one hour without a fresh heartbeat/location update.
- Production access logs omit request URLs so tracking credentials are not logged. Operational errors retain safe context without request bodies, credentials, notification payloads, or personal data.

Never commit JWT secrets, Firebase service-account JSON, database URLs, passwords, or issued tokens.

## API groups

All API routes below are under `/api/v1` unless noted otherwise.

| Area | Examples |
| --- | --- |
| Health | `GET /health` |
| Public orders | `POST /orders`, `GET /orders/track-token/:token`, legacy `GET /orders/track/:id` |
| Public customer data | `GET /customers/loyalty`, `GET /customers/loyalty-token`, `GET /business/status`, `GET /items/search` |
| Staff orders | `/orders`, `/orders/:id/assign-driver`, `/orders/:id/edit`, `/orders/:id/priority`, auto-dispatch settings and stats |
| Driver workflow | `GET /driver/orders`, `POST /driver/online`, `/driver/offline`, `/driver/heartbeat`, `POST /orders/:id/driver-action` |
| Receipts | `POST /orders/:id/receipt`, `GET /orders/:id/receipt` |
| Staff operations | `/auth/drivers`, `/customers`, `/customers/retention`, `/pickup-locations`, `/dispatcher-checklist` |

QR campaign redirect/statistics routes are outside the API prefix: `GET /q/lighter` and `GET /q/lighter/stats`.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local `.env` from `.env.example` and supply local development values. Do not copy production credentials into source control.

3. Generate and validate Prisma Client/schema:

   ```bash
   npx prisma generate
   npx prisma format --check
   npx prisma validate
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

Useful project scripts:

```bash
npm run build
npm start
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
npm run retention:90
```

`npm run prisma:migrate` runs `prisma migrate dev` and is for local development only. Production releases use reviewed, committed migrations. Never run `prisma migrate reset` against a production database.

The default local health check is:

```text
GET http://localhost:4000/api/v1/health
```
