-- Same date substitutions as bnd-weekly-report.sql. Checks run 10am-9pm Toronto,
-- with the weekly report stopping Sunday at 6pm. Missing checks are not zero orders.
WITH days AS (
  SELECT DATE 'MONDAY_DATE' + n AS local_date FROM generate_series(0, 6) AS n
), windows AS (
  SELECT local_date,
    ((local_date + TIME '10:00') AT TIME ZONE 'America/Toronto') AT TIME ZONE 'UTC' AS start_utc,
    ((local_date + CASE WHEN local_date = DATE 'SUNDAY_DATE' THEN TIME '18:00' ELSE TIME '21:00' END)
      AT TIME ZONE 'America/Toronto') AT TIME ZONE 'UTC' AS end_utc
  FROM days
), points AS (
  SELECT local_date, start_utc AS at FROM windows
  UNION ALL SELECT local_date, end_utc AS at FROM windows
  UNION ALL SELECT w.local_date, c."checkedAt" AS at FROM windows w
    JOIN "BndMonitorCheck" c ON c."checkedAt" >= w.start_utc AND c."checkedAt" < w.end_utc
), gaps AS (
  SELECT local_date, LEAD(at) OVER (PARTITION BY local_date ORDER BY at) - at AS gap FROM points
)
SELECT w.local_date::text AS local_date,
  (SELECT COUNT(*)::int FROM "BndMonitorCheck" c WHERE c."checkedAt" >= w.start_utc AND c."checkedAt" < w.end_utc) AS successful_checks,
  EXTRACT(EPOCH FROM MAX(g.gap))::int AS longest_gap_seconds,
  (SELECT MIN("checkedAt") FROM "BndMonitorCheck") AS history_began_at
FROM windows w JOIN gaps g ON g.local_date = w.local_date
GROUP BY w.local_date, w.start_utc, w.end_utc ORDER BY w.local_date;
