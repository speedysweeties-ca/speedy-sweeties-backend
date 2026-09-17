BEGIN;

DO $pickup_guard$
DECLARE
  candidate_count integer;
BEGIN
  SELECT COUNT(*)
  INTO candidate_count
  FROM "PickupLocation"
  WHERE "pickupType" = 'BROTHERS_BREWING'
     OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = 'brothersbrewingcompany';

  IF candidate_count > 1 THEN
    RAISE EXCEPTION
      'Brothers Brewing pickup migration stopped: found % possible existing locations.',
      candidate_count;
  END IF;
END
$pickup_guard$;

UPDATE "PickupLocation"
SET
  name = 'Brothers Brewing Company',
  "pickupType" = 'BROTHERS_BREWING',
  "addressLine1" = '15 Wyndham Street North Unit A',
  city = 'Guelph',
  province = 'ON',
  "postalCode" = 'N1H 4E5',
  latitude = 43.5451006,
  longitude = -80.2481718,
  "isActive" = true,
  "routingPriority" = 'STANDARD'::"PickupLocationRoutingPriority",
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "pickupType" = 'BROTHERS_BREWING'
   OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = 'brothersbrewingcompany';

INSERT INTO "PickupLocation" (
  id,
  name,
  "pickupType",
  "addressLine1",
  city,
  province,
  "postalCode",
  latitude,
  longitude,
  "isActive",
  "routingPriority",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'Brothers Brewing Company',
  'BROTHERS_BREWING',
  '15 Wyndham Street North Unit A',
  'Guelph',
  'ON',
  'N1H 4E5',
  43.5451006,
  -80.2481718,
  true,
  'STANDARD'::"PickupLocationRoutingPriority",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "PickupLocation"
  WHERE "pickupType" = 'BROTHERS_BREWING'
);

DO $pickup_verify$
DECLARE
  valid_count integer;
BEGIN
  SELECT COUNT(*)
  INTO valid_count
  FROM "PickupLocation"
  WHERE "pickupType" = 'BROTHERS_BREWING'
    AND name = 'Brothers Brewing Company'
    AND "addressLine1" = '15 Wyndham Street North Unit A'
    AND city = 'Guelph'
    AND province = 'ON'
    AND "postalCode" = 'N1H 4E5'
    AND latitude = 43.5451006
    AND longitude = -80.2481718
    AND "isActive" = true
    AND "routingPriority" = 'STANDARD'::"PickupLocationRoutingPriority";

  IF valid_count <> 1 THEN
    RAISE EXCEPTION
      'Brothers Brewing pickup migration verification failed: valid_count=%.',
      valid_count;
  END IF;
END
$pickup_verify$;

COMMIT;
