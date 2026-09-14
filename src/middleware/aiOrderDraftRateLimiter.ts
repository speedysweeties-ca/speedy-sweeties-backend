import { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const getAiOrderDraftRateLimitKey = (req: Request): string =>
  ipKeyGenerator(req.ip);

export const aiOrderDraftRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: getAiOrderDraftRateLimitKey,
  message: {
    success: false,
    message: "Too many Talk to Sweetie requests. Please try again shortly."
  }
});
