import { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const getOrderTrackingRateLimitKey = (req: Request): string =>
  ipKeyGenerator(req.ip);

export const orderTrackingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: getOrderTrackingRateLimitKey,
  message: {
    success: false,
    message: "Too many tracking requests. Please try again shortly."
  }
});
