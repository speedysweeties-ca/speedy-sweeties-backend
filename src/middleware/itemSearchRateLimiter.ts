import { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const getItemSearchRateLimitKey = (req: Request): string =>
  ipKeyGenerator(req.ip);

export const itemSearchRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: getItemSearchRateLimitKey,
  message: {
    success: false,
    message: "Too many item search requests. Please try again shortly."
  }
});
