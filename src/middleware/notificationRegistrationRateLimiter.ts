import { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const getNotificationRegistrationRateLimitKey = (req: Request): string =>
  ipKeyGenerator(req.ip);

export const notificationRegistrationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: getNotificationRegistrationRateLimitKey,
  message: {
    success: false,
    message: "Too many notification registration requests. Please try again shortly."
  }
});
