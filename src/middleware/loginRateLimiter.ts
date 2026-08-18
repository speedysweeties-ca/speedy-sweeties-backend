import { isIP } from "node:net";
import { Request } from "express";
import rateLimit from "express-rate-limit";
import { ipKeyGenerator } from "express-rate-limit";

const getLoginRateLimitKey = (req: Request): string => {
  const cloudflareIp = req.get("CF-Connecting-IP");

  if (cloudflareIp && isIP(cloudflareIp) !== 0) {
    return ipKeyGenerator(cloudflareIp);
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

  return email ? `login:${email}` : "login:missing-identifier";
};

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: getLoginRateLimitKey,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later."
  }
});