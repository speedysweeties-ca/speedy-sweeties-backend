BEGIN;

DO $pickup_guard$
BEGIN
  IF EXISTS (
    WITH targets("addressKey") AS (
      VALUES
        ('328speedvaleavenueeast'),
        ('585eramosaroad')
    )
    SELECT 1
    FROM targets t
    JOIN "PickupLocation" location
      ON location."pickupType" = 'CONVENIENCE'
     AND regexp_replace(
       lower(location."addressLine1"),
       '[^a-z0-9]',
       '',
       'g'
     ) = t."addressKey"
    GROUP BY t."addressKey"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      '7-Eleven pickup migration stopped: a target address has duplicate convenience locations.';
  END IF;
END
$pickup_guard$;

WITH targets(
  name,
  "addressLine1",
  "addressKey",
  "postalCode",
  latitude,
  longitude
) AS (
  VALUES
    (
      '7-Eleven - Speedvale & Stevenson',
      '328 Speedvale Avenue East',
      '328speedvaleavenueeast',
      'N1E 1N5',
      43.566693::double precision,
      -80.2581089::double precision
    ),
    (
      '7-Eleven - Victoria & Eramosa',
      '585 Eramosa Road',
      '585eramosaroad',
      'N1E 2N4',
      43.5680806::double precision,
      -80.2473553::double precision
    )
)
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
  target.name,
  'CONVENIENCE',
  target."addressLine1",
  'Guelph',
  'ON',
  target."postalCode",
  target.latitude,
  target.longitude,
  true,
  'STANDARD'::"PickupLocationRoutingPriority",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM targets target
WHERE NOT EXISTS (
  SELECT 1
  FROM "PickupLocation" location
  WHERE location."pickupType" = 'CONVENIENCE'
    AND regexp_replace(
      lower(location."addressLine1"),
      '[^a-z0-9]',
      '',
      'g'
    ) = target."addressKey"
);

WITH targets(
  name,
  "addressLine1",
  "addressKey",
  "postalCode",
  latitude,
  longitude
) AS (
  VALUES
    (
      '7-Eleven - Speedvale & Stevenson',
      '328 Speedvale Avenue East',
      '328speedvaleavenueeast',
      'N1E 1N5',
      43.566693::double precision,
      -80.2581089::double precision
    ),
    (
      '7-Eleven - Victoria & Eramosa',
      '585 Eramosa Road',
      '585eramosaroad',
      'N1E 2N4',
      43.5680806::double precision,
      -80.2473553::double precision
    )
)
UPDATE "PickupLocation" location
SET
  name = target.name,
  "addressLine1" = target."addressLine1",
  city = 'Guelph',
  province = 'ON',
  "postalCode" = target."postalCode",
  latitude = target.latitude,
  longitude = target.longitude,
  "isActive" = true,
  "routingPriority" = 'STANDARD'::"PickupLocationRoutingPriority",
  "updatedAt" = CURRENT_TIMESTAMP
FROM targets target
WHERE location."pickupType" = 'CONVENIENCE'
  AND regexp_replace(
    lower(location."addressLine1"),
    '[^a-z0-9]',
    '',
    'g'
  ) = target."addressKey";

DO $pickup_verify$
DECLARE
  target_count integer;
  valid_count integer;
BEGIN
  SELECT COUNT(*)
  INTO target_count
  FROM "PickupLocation"
  WHERE "pickupType" = 'CONVENIENCE'
    AND regexp_replace(lower("addressLine1"), '[^a-z0-9]', '', 'g') IN (
      '328speedvaleavenueeast',
      '585eramosaroad'
    );

  SELECT COUNT(*)
  INTO valid_count
  FROM "PickupLocation"
  WHERE "pickupType" = 'CONVENIENCE'
    AND "isActive" = true
    AND "routingPriority" = 'STANDARD'::"PickupLocationRoutingPriority"
    AND (
      (
        name = '7-Eleven - Speedvale & Stevenson'
        AND "addressLine1" = '328 Speedvale Avenue East'
        AND "postalCode" = 'N1E 1N5'
      )
      OR (
        name = '7-Eleven - Victoria & Eramosa'
        AND "addressLine1" = '585 Eramosa Road'
        AND "postalCode" = 'N1E 2N4'
      )
    );

  IF target_count <> 2 OR valid_count <> 2 THEN
    RAISE EXCEPTION
      '7-Eleven pickup migration verification failed: target_count=%, valid_count=%.',
      target_count,
      valid_count;
  END IF;
END
$pickup_verify$;

COMMIT;
