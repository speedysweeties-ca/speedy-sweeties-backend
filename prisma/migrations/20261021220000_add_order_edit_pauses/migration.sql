CREATE TABLE "OrderEditPause" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "OrderEditPause_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderEditPause_valid_interval" CHECK (
      "expiresAt" >= "startedAt" AND ("endedAt" IS NULL OR "endedAt" >= "startedAt")
    )
);
CREATE INDEX "OrderEditPause_orderId_startedAt_idx" ON "OrderEditPause"("orderId", "startedAt");
ALTER TABLE "OrderEditPause" ADD CONSTRAINT "OrderEditPause_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Share the same clipped interval union with alerts and scheduled SQL reports.
CREATE FUNCTION dispatch_edit_pause_duration(order_id TEXT, start_at TIMESTAMP, end_at TIMESTAMP)
RETURNS INTERVAL LANGUAGE SQL STABLE AS $$
  SELECT COALESCE(SUM(upper(r) - lower(r)), INTERVAL '0 seconds')
  FROM unnest((
    SELECT range_agg(tsrange(
      GREATEST(p."startedAt", start_at),
      GREATEST(GREATEST(p."startedAt", start_at),
        LEAST(end_at, p."expiresAt", COALESCE(p."endedAt", end_at))), '[)'
    ))
    FROM "OrderEditPause" p
    WHERE p."orderId" = order_id AND p."startedAt" < end_at AND p."expiresAt" > start_at
  )) AS ranges(r);
$$;
