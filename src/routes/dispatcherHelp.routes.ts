import { Router } from "express";
import { UserRole } from "@prisma/client";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { answerDispatcherQuestion, helpRequestSchema } from "../services/dispatcherHelp.service";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthTokenPayload } from "../utils/jwt";

const router = Router();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.use(requireAuth, requireRole([UserRole.ADMIN, UserRole.DISPATCHER]));
router.post("/ask", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => (req as typeof req & { user: AuthTokenPayload }).user.userId,
  message: { success: false, message: "You've reached the help question limit. Please try again in 15 minutes." }
}), asyncHandler(async (req, res) => {
  const parsed = helpRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Enter a question of 1–2,000 characters and keep the conversation to the last 8 messages." });
    return;
  }
  const user = (req as typeof req & { user: AuthTokenPayload }).user;
  const result = await answerDispatcherQuestion(parsed.data, user.role);
  // Evidence paths are maintenance metadata, not public links. Navigation is server-owned.
  res.json({ success: true, ...result, sources: result.sources.map(({ id, title, reviewedAt, destination, content }) =>
    ({ id, title, reviewedAt, destination, content })) });
}));
export default router;
