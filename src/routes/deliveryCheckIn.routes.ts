import { Router } from "express";
import { DeliveryCheckInEventType, UserRole } from "@prisma/client";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { buildCheckInSession, findCheckInOrder } from "../services/deliveryCheckIn.service";
import { buildGrowthDashboardDateRange } from "../services/growthDashboard.service";

const router = Router();
const tokenSchema = z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/);
const sessionSchema = z.object({ trackingToken: tokenSchema }).strict();
const helpSchema = z.object({ trackingToken: tokenSchema, message: z.string().trim().min(5).max(1500) }).strict();
const eventSchema = z.object({ trackingToken: tokenSchema, type: z.enum(DeliveryCheckInEventType) }).strict();
const handledSchema = z.object({ resolutionNote: z.string().trim().min(3).max(1000) }).strict();
const publicReads = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false });
const publicWrites = rateLimit({ windowMs: 10 * 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false });

router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

// Credentials travel in the body, never in this page's URL query or access logs.
router.post("/session", publicReads, asyncHandler(async (req, res) => {
  const { trackingToken } = sessionSchema.parse(req.body);
  res.json({ success: true, data: buildCheckInSession(await findCheckInOrder(trackingToken)) });
}));

router.post("/help", publicWrites, asyncHandler(async (req, res) => {
  const { trackingToken, message } = helpSchema.parse(req.body);
  const order = await findCheckInOrder(trackingToken, true);
  // Unique orderId makes retries/double taps safe across API instances.
  const request = await prisma.deliveryHelpRequest.upsert({
    where: { orderId: order.id }, update: {}, create: { orderId: order.id, message },
    select: { id: true, status: true, createdAt: true, handledAt: true }
  });
  res.json({ success: true, data: request });
}));

router.post("/events", publicWrites, asyncHandler(async (req, res) => {
  const { trackingToken, type } = eventSchema.parse(req.body);
  const order = await findCheckInOrder(trackingToken, true);
  await prisma.deliveryCheckInEvent.upsert({
    where: { orderId_type: { orderId: order.id, type } },
    update: {}, create: { orderId: order.id, type }
  });
  res.json({ success: true });
}));

router.use(requireAuth, requireRole([UserRole.ADMIN, UserRole.DISPATCHER]));

router.get("/requests", asyncHandler(async (req, res) => {
  const status = z.enum(["OPEN", "HANDLED"]).default("OPEN").parse(req.query.status);
  const page = z.coerce.number().int().min(1).max(10000).default(1).parse(req.query.page);
  const where = { status };
  const [requests, total, openTotal] = await Promise.all([
    prisma.deliveryHelpRequest.findMany({
      where, orderBy: [{ createdAt: status === "OPEN" ? "asc" : "desc" }, { id: "asc" }],
      skip: (page - 1) * 25, take: 25,
      include: {
        order: { select: { id: true, orderNumber: true, customerName: true, phone: true, deliveredAt: true } },
        handledBy: { select: { firstName: true, lastName: true } }
      }
    }), prisma.deliveryHelpRequest.count({ where }),
    prisma.deliveryHelpRequest.count({ where: { status: "OPEN" } })
  ]);
  res.json({ success: true, requests, total, openTotal, page, pageSize: 25 });
}));

router.patch("/requests/:id/handled", asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { resolutionNote } = handledSchema.parse(req.body);
  const staff = (req as typeof req & { user: { userId: string } }).user;
  // The first handler wins; repeat requests never overwrite the original audit.
  await prisma.deliveryHelpRequest.updateMany({
    where: { id, status: "OPEN" },
    data: { status: "HANDLED", handledAt: new Date(), handledByUserId: staff.userId, resolutionNote }
  });
  const request = await prisma.deliveryHelpRequest.findUnique({ where: { id } });
  if (!request) throw new ApiError(404, "Help request not found.");
  res.json({ success: true, data: request });
}));

router.get("/results", requireRole([UserRole.ADMIN]), asyncHandler(async (req, res) => {
  let range: ReturnType<typeof buildGrowthDashboardDateRange>;
  try {
    range = buildGrowthDashboardDateRange(
      z.string().optional().parse(req.query.startDate), z.string().optional().parse(req.query.endDate)
    );
  } catch { throw new ApiError(400, "Choose a valid date range of up to 366 days."); }
  const createdAt = { gte: range.startUtc, lt: range.endExclusiveUtc };
  const [events, requested, customersRequestingHelp, open, handling, repeat] = await Promise.all([
    prisma.deliveryCheckInEvent.groupBy({ by: ["type"], where: { createdAt }, _count: { _all: true } }),
    prisma.deliveryHelpRequest.count({ where: { createdAt } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT o."customerId") AS count FROM "DeliveryHelpRequest" h
      JOIN "Order" o ON o.id = h."orderId"
      WHERE h."createdAt" >= ${range.startUtc} AND h."createdAt" < ${range.endExclusiveUtc}`,
    prisma.deliveryHelpRequest.count({ where: { status: "OPEN" } }),
    prisma.$queryRaw<Array<{ handled: bigint; averageMinutes: number | null }>>`
      SELECT COUNT(*) AS handled,
        AVG(EXTRACT(EPOCH FROM ("handledAt" - "createdAt")) / 60)::float8 AS "averageMinutes"
      FROM "DeliveryHelpRequest" WHERE "createdAt" >= ${range.startUtc}
        AND "createdAt" < ${range.endExclusiveUtc} AND "status" = 'HANDLED'`,
    prisma.$queryRaw<Array<{ firstTimeCustomers: bigint; orderedAgain: bigint }>>`
      WITH first_deliveries AS (
        SELECT "customerId", MIN("deliveredAt") AS first_at FROM "Order"
        WHERE "orderStatus" = 'DELIVERED' AND "customerId" IS NOT NULL AND "deliveredAt" IS NOT NULL
        GROUP BY "customerId"
      ), cohort AS (
        SELECT f."customerId" FROM first_deliveries f
        WHERE f.first_at >= ${range.startUtc} AND f.first_at < ${range.endExclusiveUtc}
      ), counts AS (
        SELECT c."customerId", COUNT(*) AS deliveries FROM cohort c
        JOIN "Order" o ON o."customerId" = c."customerId"
        WHERE o."orderStatus" = 'DELIVERED' AND o."deliveredAt" < ${range.endExclusiveUtc}
        GROUP BY c."customerId"
      ) SELECT COUNT(*) AS "firstTimeCustomers",
        COUNT(*) FILTER (WHERE deliveries >= 2) AS "orderedAgain" FROM counts`
  ]);
  const count = (type: DeliveryCheckInEventType) => events.find(event => event.type === type)?._count._all ?? 0;
  res.json({ success: true, data: {
    startDate: range.startDate, endDate: range.endDate, timeZone: "America/Toronto",
    viewed: count("VIEWED"), reviewClicks: count("REVIEW_CLICK"),
    shareClicks: count("SHARE_CLICK"), shareCompleted: count("SHARE_COMPLETED"),
    requested, customersRequestingHelp: Number(customersRequestingHelp[0]?.count ?? 0), open,
    handled: Number(handling[0]?.handled ?? 0), averageHandlingMinutes: handling[0]?.averageMinutes ?? null,
    firstTimeCustomers: Number(repeat[0]?.firstTimeCustomers ?? 0),
    orderedAgain: Number(repeat[0]?.orderedAgain ?? 0), generatedAt: new Date().toISOString()
  } });
}));

export default router;
