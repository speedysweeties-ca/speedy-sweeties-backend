import { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const getOrderCreationRateLimitKey = (req: Request): string =>
  ipKeyGenerator(req.ip);

export const orderCreationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: getOrderCreationRateLimitKey,
  message: {
    success: false,
    message: "Too many order attempts. Please try again shortly."
  }
});
