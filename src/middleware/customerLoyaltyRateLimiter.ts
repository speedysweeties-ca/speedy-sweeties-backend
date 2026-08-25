import { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const getCustomerLoyaltyRateLimitKey = (req: Request): string =>
  ipKeyGenerator(req.ip);

export const customerLoyaltyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: getCustomerLoyaltyRateLimitKey,
  message: {
    success: false,
    message: "Too many loyalty requests. Please try again shortly."
  }
});
