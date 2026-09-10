BEGIN;

CREATE TEMP TABLE "_repair_affected_orders" ON COMMIT DROP AS
SELECT
  o.id AS order_id,
  o."orderNumber" AS order_number,
  o."customerId" AS original_customer_id,
  o."createdAt" AS created_at,
  regexp_replace(COALESCE(o.phone, ''), '[^0-9]', '', 'g') AS phone_digits
FROM "Order" o
WHERE o."customerId" = 'c1b6b98b-966f-4f60-89bf-79f9e3dc7f1f'
  AND o."orderNumber" <= 4344;

DO $repair_guard$
DECLARE
  affected_count integer;
  phone_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Customer"
    WHERE id = 'c1b6b98b-966f-4f60-89bf-79f9e3dc7f1f'
  ) THEN
    RAISE NOTICE 'Placeholder customer repair skipped: source customer is absent.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO affected_count FROM "_repair_affected_orders";
  SELECT COUNT(DISTINCT phone_digits) INTO phone_count
  FROM "_repair_affected_orders";

  IF affected_count <> 55 THEN
    RAISE EXCEPTION
      'Placeholder customer repair stopped: expected 55 affected orders, found %.',
      affected_count;
  END IF;

  IF phone_count <> 37 THEN
    RAISE EXCEPTION
      'Placeholder customer repair stopped: expected 37 phone groups, found %.',
      phone_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "_repair_affected_orders" a
    JOIN "Order" o ON o.id = a.order_id
    WHERE o."orderStatus"::text <> 'DELIVERED'
       OR lower(trim(o.email)) <> 'example@yahoo.com'
       OR a.phone_digits = ''
  ) THEN
    RAISE EXCEPTION
      'Placeholder customer repair stopped: an affected order failed the status, email, or phone guard.';
  END IF;

  IF EXISTS (
    SELECT affected_phones.phone_digits
    FROM (
      SELECT DISTINCT phone_digits
      FROM "_repair_affected_orders"
    ) affected_phones
    JOIN "Customer" c
      ON c."normalizedPhone" = affected_phones.phone_digits
    GROUP BY affected_phones.phone_digits
    HAVING COUNT(c.id) > 1
  ) THEN
    RAISE EXCEPTION
      'Placeholder customer repair stopped: an affected phone matches multiple customer profiles.';
  END IF;
END
$repair_guard$;

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
SELECT
  'repair:placeholder-customer-20260910:orders',
  jsonb_agg(
    jsonb_build_object(
      'orderId', a.order_id,
      'orderNumber', a.order_number,
      'originalCustomerId', a.original_customer_id,
      'phoneDigits', a.phone_digits
    )
    ORDER BY a.order_number
  )::text,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "_repair_affected_orders" a
HAVING COUNT(*) > 0
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
SELECT
  'repair:placeholder-customer-20260910:customers',
  jsonb_agg(to_jsonb(c) ORDER BY c.id)::text,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Customer" c
WHERE c.id = 'c1b6b98b-966f-4f60-89bf-79f9e3dc7f1f'
   OR c."normalizedPhone" IN (
     SELECT DISTINCT phone_digits
     FROM "_repair_affected_orders"
   )
HAVING EXISTS (SELECT 1 FROM "_repair_affected_orders")
ON CONFLICT ("key") DO NOTHING;

CREATE TEMP TABLE "_repair_phone_map" ON COMMIT DROP AS
SELECT
  affected_phones.phone_digits,
  COALESCE(existing_customer.id, gen_random_uuid()::text) AS target_customer_id,
  existing_customer.id IS NULL AS create_new_customer
FROM (
  SELECT DISTINCT phone_digits
  FROM "_repair_affected_orders"
) affected_phones
LEFT JOIN "Customer" existing_customer
  ON existing_customer."normalizedPhone" = affected_phones.phone_digits;

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
SELECT
  'repair:placeholder-customer-20260910:mapping',
  jsonb_agg(
    jsonb_build_object(
      'phoneDigits', phone_digits,
      'targetCustomerId', target_customer_id,
      'createdByRepair', create_new_customer
    )
    ORDER BY phone_digits
  )::text,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "_repair_phone_map"
HAVING COUNT(*) > 0
ON CONFLICT ("key") DO NOTHING;

CREATE TEMP TABLE "_repair_latest_snapshot" ON COMMIT DROP AS
SELECT DISTINCT ON (a.phone_digits)
  a.phone_digits,
  o."customerName" AS customer_name,
  o.phone,
  o.email,
  o."addressLine1" AS address_line_1,
  o.city,
  o.province,
  o."postalCode" AS postal_code
FROM "_repair_affected_orders" a
JOIN "Order" o ON o.id = a.order_id
ORDER BY a.phone_digits, o."createdAt" DESC, o."orderNumber" DESC;

INSERT INTO "Customer" (
  id,
  "fullName",
  "normalizedFullName",
  phone,
  "normalizedPhone",
  email,
  "normalizedEmail",
  "addressLine1",
  city,
  province,
  "postalCode",
  notes,
  "dispatcherNotes",
  "recurringDriverNotes",
  "smsMarketingOptOut",
  "smsMarketingOptOutAt",
  "smsExpressConsentAt",
  "smsExpressConsentSource",
  "loyaltyCompletedOrders",
  "loyaltyProgressMonth",
  "loyaltyRewardsEarned",
  "loyaltyRewardsUsed",
  "loyaltyRewardBalance",
  "loyaltyFreeDelivery",
  "createdAt",
  "updatedAt"
)
SELECT
  m.target_customer_id,
  trim(s.customer_name),
  lower(trim(s.customer_name)),
  trim(s.phone),
  m.phone_digits,
  CASE
    WHEN lower(trim(s.email)) = 'example@yahoo.com' THEN NULL
    ELSE lower(trim(s.email))
  END,
  CASE
    WHEN lower(trim(s.email)) = 'example@yahoo.com' THEN NULL
    ELSE lower(trim(s.email))
  END,
  trim(s.address_line_1),
  trim(s.city),
  trim(s.province),
  s.postal_code,
  NULL,
  NULL,
  NULL,
  false,
  NULL,
  NULL,
  NULL,
  0,
  to_char(CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto', 'YYYY-MM'),
  0,
  0,
  0,
  false,
  first_orders.first_created_at,
  CURRENT_TIMESTAMP
FROM "_repair_phone_map" m
JOIN "_repair_latest_snapshot" s USING (phone_digits)
JOIN (
  SELECT phone_digits, MIN(created_at) AS first_created_at
  FROM "_repair_affected_orders"
  GROUP BY phone_digits
) first_orders USING (phone_digits)
WHERE m.create_new_customer;

UPDATE "Order" o
SET "customerId" = m.target_customer_id
FROM "_repair_affected_orders" a
JOIN "_repair_phone_map" m USING (phone_digits)
WHERE o.id = a.order_id
  AND o."customerId" = a.original_customer_id;

WITH target_customers AS (
  SELECT DISTINCT target_customer_id
  FROM "_repair_phone_map"
),
latest_order AS (
  SELECT DISTINCT ON (o."customerId")
    o."customerId",
    o."addressLine1",
    o.city,
    o.province
  FROM "Order" o
  JOIN target_customers t ON t.target_customer_id = o."customerId"
  ORDER BY o."customerId", o."createdAt" DESC, o."orderNumber" DESC
)
UPDATE "Customer" c
SET
  "addressLine1" = latest_order."addressLine1",
  city = latest_order.city,
  province = latest_order.province,
  "updatedAt" = CURRENT_TIMESTAMP
FROM latest_order
WHERE c.id = latest_order."customerId";

WITH target_customers AS (
  SELECT DISTINCT target_customer_id
  FROM "_repair_phone_map"
),
monthly_deliveries AS (
  SELECT
    o."customerId" AS customer_id,
    to_char(
      o."deliveredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Toronto',
      'YYYY-MM'
    ) AS loyalty_month,
    COUNT(*)::integer AS delivered_count
  FROM "Order" o
  JOIN target_customers t ON t.target_customer_id = o."customerId"
  WHERE o."orderStatus"::text = 'DELIVERED'
    AND o."deliveredAt" IS NOT NULL
  GROUP BY o."customerId", loyalty_month
),
earned_totals AS (
  SELECT
    customer_id,
    COALESCE(SUM(FLOOR(delivered_count / 10.0)), 0)::integer AS rewards_earned
  FROM monthly_deliveries
  GROUP BY customer_id
),
current_progress AS (
  SELECT
    customer_id,
    (delivered_count % 10)::integer AS completed_orders
  FROM monthly_deliveries
  WHERE loyalty_month = to_char(
    CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto',
    'YYYY-MM'
  )
),
redemption_markers AS (
  SELECT
    o."customerId" AS customer_id,
    COUNT(*) FILTER (
      WHERE COALESCE(o."additionalNotes", '') ILIKE '%LOYALTY REWARD:%'
    )::integer AS marker_count
  FROM "Order" o
  JOIN target_customers t ON t.target_customer_id = o."customerId"
  WHERE o."orderStatus"::text = 'DELIVERED'
  GROUP BY o."customerId"
),
loyalty_totals AS (
  SELECT
    t.target_customer_id AS customer_id,
    COALESCE(e.rewards_earned, 0) AS rewards_earned,
    LEAST(
      COALESCE(r.marker_count, 0),
      COALESCE(e.rewards_earned, 0)
    ) AS rewards_used,
    COALESCE(p.completed_orders, 0) AS completed_orders
  FROM target_customers t
  LEFT JOIN earned_totals e ON e.customer_id = t.target_customer_id
  LEFT JOIN current_progress p ON p.customer_id = t.target_customer_id
  LEFT JOIN redemption_markers r ON r.customer_id = t.target_customer_id
)
UPDATE "Customer" c
SET
  "loyaltyCompletedOrders" = totals.completed_orders,
  "loyaltyProgressMonth" = to_char(
    CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto',
    'YYYY-MM'
  ),
  "loyaltyRewardsEarned" = totals.rewards_earned,
  "loyaltyRewardsUsed" = totals.rewards_used,
  "loyaltyRewardBalance" = totals.rewards_earned - totals.rewards_used,
  "loyaltyFreeDelivery" = totals.rewards_earned - totals.rewards_used > 0,
  "updatedAt" = CURRENT_TIMESTAMP
FROM loyalty_totals totals
WHERE c.id = totals.customer_id;

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
SELECT
  'repair:placeholder-customer-20260910:result',
  jsonb_build_object(
    'repairedAt', CURRENT_TIMESTAMP,
    'affectedOrders', (SELECT COUNT(*) FROM "_repair_affected_orders"),
    'phoneGroups', (SELECT COUNT(*) FROM "_repair_phone_map"),
    'newCustomers', (
      SELECT COUNT(*)
      FROM "_repair_phone_map"
      WHERE create_new_customer
    ),
    'existingCustomers', (
      SELECT COUNT(*)
      FROM "_repair_phone_map"
      WHERE NOT create_new_customer
    )
  )::text,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "_repair_affected_orders")
ON CONFLICT ("key") DO NOTHING;

DO $repair_verify$
DECLARE
  correctly_linked_count integer;
  repaired_customer_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "_repair_affected_orders"
  ) THEN
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO correctly_linked_count
  FROM "_repair_affected_orders" a
  JOIN "Order" o ON o.id = a.order_id
  JOIN "Customer" c ON c.id = o."customerId"
  WHERE c."normalizedPhone" = a.phone_digits;

  IF correctly_linked_count <> 55 THEN
    RAISE EXCEPTION
      'Placeholder customer repair verification failed: only % of 55 orders have the correct phone-based customer.',
      correctly_linked_count;
  END IF;

  SELECT COUNT(DISTINCT o."customerId")
  INTO repaired_customer_count
  FROM "_repair_affected_orders" a
  JOIN "Order" o ON o.id = a.order_id;

  IF repaired_customer_count <> 37 THEN
    RAISE EXCEPTION
      'Placeholder customer repair verification failed: expected 37 target customers, found %.',
      repaired_customer_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "_repair_phone_map" m
    JOIN "Customer" c ON c.id = m.target_customer_id
    WHERE c."loyaltyCompletedOrders" < 0
       OR c."loyaltyCompletedOrders" > 9
       OR c."loyaltyRewardsUsed" > c."loyaltyRewardsEarned"
       OR c."loyaltyRewardBalance" <>
          c."loyaltyRewardsEarned" - c."loyaltyRewardsUsed"
       OR c."loyaltyFreeDelivery" <>
          (c."loyaltyRewardBalance" > 0)
  ) THEN
    RAISE EXCEPTION
      'Placeholder customer repair verification failed: a repaired loyalty record is inconsistent.';
  END IF;
END
$repair_verify$;

COMMIT;
