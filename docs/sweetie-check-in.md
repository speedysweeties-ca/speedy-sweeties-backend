# Sweetie Check-In

This release connects the website's existing completed-order tracker to a receipt,
app loyalty progress, customer support, an honest Google review invitation, and a
public website sharing button. Dispatchers see a persistent follow-up panel on
every tab. Administrators also see results in the Growth Command Centre.

## Customer experience

- The existing Webflow tracker embeds `/track/?embedded=1#<trackingToken>` once an
  order is delivered. Changing or forgetting the selected order removes the frame.
- `/track/#<trackingToken>` also works as a standalone page. The token remains in
  the URL fragment; API calls use JSON bodies. There are no third-party scripts.
- The existing 48-hour tracking expiry is enforced on every API request. Legacy
  order IDs alone cannot access receipts, loyalty, or submit help requests.
- The receipt exposes only its number and amount breakdown, never internal notes.
- Loyalty follows the existing rules: qualifying Android/iOS deliveries only,
  monthly progress reset in Toronto time, and carried-forward reward balance.
  Website orders do not earn new app loyalty progress.
- One support request per order is saved. Retries cannot create duplicates or
  overwrite a handled request. The customer can call dispatch for further help.
- Review access is the same whether or not a customer requests help. The link uses
  the same `GOOGLE_PLACE_ID` configuration as the business-status integration.
- Sharing contains only the public website URL and fixed campaign tags. It never
  includes the private tracking token, order number, receipt, or customer details.
- This release sends no emails, SMS, or push messages. Native app tracking screens
  are unchanged; a later app release can open the standalone page using its stored
  tracking token.

## Dispatcher and owner

- The follow-up panel polls independently every 15 seconds and keeps open requests
  visible across tabs, reloads, and API restarts. It is a visual alert/queue.
- Staff can review the order number, customer name, phone, and issue, then record a
  resolution note and press **Handled**. The first handler's user ID and timestamp
  are preserved if two dispatchers act at once. Handled requests remain in history.
- The results endpoint is ADMIN-only. The help queue is ADMIN/DISPATCHER-only.
- Results follow the applied Growth Command Centre date range, in Toronto time.
  Help counts and average elapsed handling time use requests received in that
  period; **Still waiting** covers all dates. Handling time includes closed hours.
- Action counts are distinct orders, once per action, dated at first use. Review
  clicks are not posted reviews. Completed shares include successful native-share
  responses and clipboard copies, not confirmed recipients or referrals.
- Repeat customers are customers whose first recorded completed delivery falls in
  the selected period and who have another completed delivery before period end.
  Only linked customers with delivery timestamps participate. These figures do not
  establish that check-ins caused additional orders.

## Release sequence

1. Merge this change, apply `prisma migrate deploy`, and deploy the backend. Ensure
   `public/track` is shipped along with `dist` (the standard repository deployment
   already keeps source/static files). No new secret or environment variable is
   required.
2. Deploy the dispatcher. Confirm Customer follow-ups loads and an administrator
   can load Sweetie Check-In results in Growth Command Centre.
3. Read Webflow's current **site-level footer code** again before changing it. This
   release's `webflow/site-footer.html` starts with the live code read on 2026-10-04,
   with only the iframe lifecycle/resize integration added. Preserve newer edits
   if the footer has changed; do not replace newer code blindly. The older
   `webflow/order-form.js` is not the current live complete form/tracking bundle.
4. Apply the merged footer to Webflow, publish staging, and inspect a controlled
   delivered order. Verify receipt, loyalty explanation, support submission,
   dispatch handling, review access, public sharing, switching orders, and forgetting
   an order. Then publish production. Keep site head code and analytics unchanged.
5. Confirm the configured Google review link opens Speedy Sweeties before rollout.
   Do not generate a real review or send a share message during testing.

The Webflow footer is intentionally not published before its backend is available.
The customer website integration and database migration are both required; simply
deploying the dispatcher does not activate the customer check-in.

## Rollback

Remove the check-in iframe integration from the Webflow footer and republish first,
then roll back the dispatcher/API if needed. Leave the additive database tables in
place to preserve customer requests and handling history. No existing order,
customer, receipt, loyalty, or dispatch field is modified by this migration.

## Verification

- Backend CI: Prisma format/validate/generate, TypeScript build, all Node tests.
- Dispatcher CI: lint, tests, TypeScript build, Vite production build.
- New HTTP tests cover token hashing/expiry predicates, delivered-only writes,
  validation, duplicate handling, neutral review access, app-only loyalty, monthly
  rollover, staff access, and preservation of the first handling audit.
- Local PostgreSQL engine validation applies the baseline schema plus this
  migration and checks uniqueness, actual cohort SQL, and handling-time SQL with
  seeded fixtures. No production database is used.
- Browser fixtures exercise desktop/mobile customer pages and dispatcher controls
  without creating production orders, submitting reviews, or sending messages.
