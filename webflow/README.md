# Website order tracking

The Webflow website uses the existing `POST /api/v1/orders` response's `trackingToken`, then reads `GET /api/v1/orders/track-token/:token`. No backend, database, dispatcher, or app changes are required.

- Four stages: received, driver assigned, on the way, delivered; cancellation has its own message.
- Polls the selected active order every 15 seconds while visible; stops on completed/cancelled/expired orders and backs off after failures.
- Remembers up to five recent orders in this browser for at most 48 hours. Stores only token, order number, and saved time. The backend independently enforces token expiry.
- Private links use a URL fragment. `order-tracking-head.js` removes it **before analytics starts** and passes it to the tracker in memory.
- A rejected/expired token never falls back to the legacy order-ID endpoint.
- Missing storage, clipboard access, connection, or credentials cannot turn a successful submission into a failed order.
- Customers who ordered before this feature cannot automatically recover an order because the former site did not retain its token.

## Files and deployment

`order-form.js` retains the existing submission behavior and broadcasts the successful result to `order-tracking.js`. It supports both the current native Webflow apartment field and older markup. Apartment/unit and buzz code are still separate API fields; the street address used for geocoding is unchanged.

`node webflow/build-site-code.cjs` composes `site-head.html` and `site-footer.html`, preserving the pre-existing analytics. Set the **site-level** Webflow head/footer blocks to those files. Page-level code stays unchanged. The token-scrubbing script must precede analytics.

Site: `668d7e5e9dff3dff6a9a593c`; homepage: `668d7e5e9dff3dff6a9a595a`.

Publish first to `speedy-sweeties.webflow.io`, verify, then publish the custom domains. Before deploying again, read current Webflow code and reconcile concurrent edits; do not overwrite newer work with these snapshots.

`backups/2026-10-01-before-tracking.json` contains the exact previous site/page code. Restore only the site head/footer blocks from it to roll back this feature, then republish.

## Validation

Run `npm ci --prefix webflow && npm test --prefix webflow`. Tests simulate the public API; they do not submit production orders. Browser validation additionally uses the published page markup with intercepted API responses for creation, reload, private links, and mobile layout. Existing Webflow/jQuery scripts run from downloaded copies; the external anti-bot provider is simulated only inside that isolated test. Live API checks use an intentionally invalid token to confirm routing and CORS without accessing customer orders.
