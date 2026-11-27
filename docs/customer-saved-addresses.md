# Customer saved addresses — dispatcher first

Customers can retain up to 20 automatically numbered addresses (Address 1 through Address 20) on their existing customer record.
Staff find that record through the existing name/phone search; this does not merge
customers sharing a phone or expose an address through public phone lookup.

In Customers, expand **Saved addresses** to add, edit, remove or make an entry the
default. In Create Manual Order, selecting a customer initially copies their saved
default (falling back to their existing profile address). **Use saved address**
copies a different entry, including unit and buzz code, into the current form.
Confirm the destination with the caller. Saving an entry takes effect immediately,
even if the order is cancelled. Editing an entry does not update a draft already
filled from it; explicitly select it again. New customers can be managed after
their first order creates the customer record.

The profile address remains the last-used address for compatibility. Profile
edits and orders do not rewrite the address book; staff explicitly save entries.
The first entry becomes default automatically. Removing a default promotes the
oldest remaining entry. To change defaults, use **Make default** on another entry.
Deleting every saved entry restores the last-used profile fallback. Existing orders
always retain their own address snapshots. No customer website/app UI is included.
Customer-facing access requires a separate verified-identity design; loyalty
credentials and a phone number alone are not approved address-book credentials.

## Database and rollout

Apply `20261125190000_customer_saved_addresses` before releasing the API, then
release the dispatcher. It creates a cascading CustomerAddress relation and a
partial unique index allowing at most one default per customer. It seeds every
nonempty current profile address as **Address 1**, preserving unit and buzz
code. Historical order addresses are not imported. Mutations serialize on the
customer row and restrict the address ID to the requested customer.

Use the normal reviewed production migration procedure and confirm migration
history first. Do not use `db push` in production: it does not install the partial
index or perform the address backfill. No new env variables, dependencies or paid
services are needed. Storage stays in the existing database.

Deletion preview hashes and recovery evidence now include saved addresses.
Before a production rollout, check for unresolved recovery journal intents and
complete their existing recovery procedure under the matching old code/schema;
do not overwrite or re-baseline evidence to force a digest match. Previously
issued deletion/intake previews must be refreshed. Customer deletion cascades to
the address book. Privacy gates remain unchanged.

Require owner merge/deployment approval and both required CI jobs at the exact
head. Smoke-test staff address selection, add/edit/remove/default and order
creation after release. Record the prior healthy revision. For code rollback,
retain the additive table/data/index; do not drop saved addresses. Old code cannot
manage the list, and recovery evidence compatibility must be checked before any
privacy recovery operation across revisions.

## Verification

- Backend check: 635 passed, 15 environment-gated skips in the full local run.
- Focused address tests: 8 passed, including staff authorization and cross-customer IDs.
- Dispatcher lint, 72 tests and production build passed.
- Real isolated PostgreSQL: migration/backfill, concurrent defaults, unique-index
  enforcement, default promotion, unchanged order snapshots, profile independence
  and cascading deletion passed.
- Prisma validation/format, dispatcher help gate and dependency audits passed
  (zero reported vulnerabilities).
- Local privacy lifecycle, route and intake database regressions: 52 passed.
- Browser exercise with synthetic API responses: selection, add, default, edit and
  remove passed; unit/buzz copying and strict request payload were verified.

Help guides: `customer-profile`, `manual-order`.
Example questions: “How do I save a customer's work address?” and
“How do I choose a different saved address for a telephone order?”

Numbered labels are assigned by the server and cannot be edited. Existing numbers
stay the same when a default changes or an entry is removed; a new entry reuses
the lowest available number.
