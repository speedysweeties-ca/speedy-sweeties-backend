-- Same date substitutions as bnd-weekly-report.sql. Use the daily hours actually
-- saved by the monitor, including published holiday closures. Older dates retain
-- the legacy 10am-9pm window. Stop at the Sunday 6pm reporting cutoff.
WITH days AS (
  SELECT DATE 'MONDAY_DATE' + n AS local_date FROM generate_series(0, 6) AS n
), published AS (
  SELECT d.local_date, COALESCE(s.value::jsonb->>'source', 'legacy') AS hours_source,
    CASE WHEN s.key IS NULL THEN
      ((d.local_date + TIME '10:00') AT TIME ZONE 'America/Toronto') AT TIME ZONE 'UTC'
    ELSE (s.value::jsonb->>'startAt')::timestamptz AT TIME ZONE 'UTC' END AS start_utc,
    CASE WHEN s.key IS NULL THEN
      ((d.local_date + TIME '21:00') AT TIME ZONE 'America/Toronto') AT TIME ZONE 'UTC'
    ELSE (s.value::jsonb->>'endAt')::timestamptz AT TIME ZONE 'UTC' END AS close_utc
  FROM days d LEFT JOIN "SystemSetting" s ON s.key = 'bndHours:' || d.local_date::text
), windows AS (
  SELECT local_date, hours_source, start_utc,
    CASE WHEN close_utc IS NULL THEN NULL ELSE LEAST(close_utc,
      (TIMESTAMP 'SUNDAY_DATE 18:00:00' AT TIME ZONE 'America/Toronto') AT TIME ZONE 'UTC') END AS end_utc
  FROM published
), points AS (
  SELECT local_date, start_utc AS at FROM windows
  UNION ALL SELECT local_date, end_utc AS at FROM windows
  UNION ALL SELECT w.local_date, c."checkedAt" AS at FROM windows w
    JOIN "BndMonitorCheck" c ON c."checkedAt" >= w.start_utc AND c."checkedAt" < w.end_utc
), gaps AS (
  SELECT local_date, LEAD(at) OVER (PARTITION BY local_date ORDER BY at) - at AS gap FROM points
)
SELECT w.local_date::text AS local_date, w.hours_source,
  GREATEST(0, COALESCE(EXTRACT(EPOCH FROM w.end_utc - w.start_utc), 0))::int AS expected_open_seconds,
  (SELECT COUNT(*)::int FROM "BndMonitorCheck" c WHERE c."checkedAt" >= w.start_utc AND c."checkedAt" < w.end_utc) AS successful_checks,
  GREATEST(0, COALESCE(EXTRACT(EPOCH FROM MAX(g.gap)), 0))::int AS longest_gap_seconds,
  (SELECT MIN("checkedAt") FROM "BndMonitorCheck") AS history_began_at
FROM windows w JOIN gaps g ON g.local_date = w.local_date
GROUP BY w.local_date, w.hours_source, w.start_utc, w.end_utc ORDER BY w.local_date;
