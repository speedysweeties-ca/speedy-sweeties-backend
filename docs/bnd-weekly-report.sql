-- Replace MONDAY_DATE and SUNDAY_DATE (YYYY-MM-DD) for the scheduled Toronto week.
-- Read-only. Timestamp outputs are UTC; display them in America/Toronto.
WITH bounds AS (
  SELECT
    (TIMESTAMP 'MONDAY_DATE 00:00:00' AT TIME ZONE 'America/Toronto') AT TIME ZONE 'UTC' AS start_utc,
    (TIMESTAMP 'SUNDAY_DATE 18:00:00' AT TIME ZONE 'America/Toronto') AT TIME ZONE 'UTC' AS end_utc
), first_seen AS (
  SELECT "orderId", MIN("firstSeenAt") AS first_observed
  FROM "BndWaitingPeriod" GROUP BY "orderId"
), qualifying AS (
  SELECT DISTINCT ON (p."orderId") p.*, b.end_utc
  FROM "BndWaitingPeriod" p
  JOIN first_seen f ON f."orderId" = p."orderId"
  CROSS JOIN bounds b
  WHERE f.first_observed >= b.start_utc AND f.first_observed < b.end_utc
    AND p."overFiveMinutesAt" < b.end_utc
  ORDER BY p."orderId", p."overFiveMinutesAt", p.id
)
SELECT q."orderId" AS order_id, q."orderNumber" AS order_number,
  q."firstSeenAt" AS waiting_first_observed_at,
  q."overFiveMinutesAt" AS over_five_minutes_observed_at,
  EXTRACT(EPOCH FROM q."overFiveMinutesAt" - q."firstSeenAt")::int AS confirmed_wait_seconds,
  (SELECT MIN(p."endObservedAt") FROM "BndWaitingPeriod" p
   WHERE p."orderId" = q."orderId" AND p."endReason" = 'CLAIMED'
     AND p."endObservedAt" >= q."overFiveMinutesAt" AND p."endObservedAt" < q.end_utc
  ) AS opening_detected_at
FROM qualifying q
ORDER BY q."overFiveMinutesAt", q."orderId";
