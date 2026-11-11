import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { CustomerNotificationError, CustomerNotificationTokens, notificationMutationSchema } from "../services/customerNotificationToken.service";

const router = Router();
const service = new CustomerNotificationTokens(prisma);
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
router.use(rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false,
  message: { success: false, code: "NOTIFICATION_RATE_LIMITED" } }));
const idSchema = z.string().uuid();
function failure(error: unknown, res: import("express").Response) {
  if (error instanceof CustomerNotificationError) res.status(error.status).json({ success: false, code: error.code });
  else if (error instanceof z.ZodError) res.status(400).json({ success: false, code: "INVALID_NOTIFICATION_REQUEST" });
  else res.status(503).json({ success: false, code: "NOTIFICATION_TEMPORARY_FAILURE" });
}
router.route("/orders/:id/token").get(asyncHandler(async (req, res) => {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get("Authorization") || "")?.[1] || "";
  try { res.json({ success: true, data: await service.read(idSchema.parse(req.params.id), token) }); }
  catch (error) {
    failure(error, res);
  }
})).put(asyncHandler(async (req, res) => {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get("Authorization") || "")?.[1] || "";
  try { res.json({ success: true, data: await service.mutate(idSchema.parse(req.params.id), token, notificationMutationSchema.parse(req.body)) }); }
  catch (error) {
    failure(error, res);
  }
}));
export default router;
