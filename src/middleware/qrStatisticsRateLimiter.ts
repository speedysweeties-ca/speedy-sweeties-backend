import { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const getQrStatisticsRateLimitKey = (req: Request): string =>
  ipKeyGenerator(req.ip);

export const qrStatisticsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: getQrStatisticsRateLimitKey,
  message: {
    success: false,
    message: "Too many QR statistics requests. Please try again shortly."
  }
});
