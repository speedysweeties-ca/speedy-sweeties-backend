import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { isWebflowOrderOrigin } from "../utils/orderSourceAttribution";
import { verifyWebsiteToken, WebsiteVerificationError } from "../services/websiteVerification.service";

export async function requireWebsiteVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.body?.turnstileToken;
  // Origin wins over a client-supplied mobile source. Native apps keep their existing flow.
  // This protects website submissions, not unauthenticated clients that impersonate native apps.
  const website = isWebflowOrderOrigin(req.get("origin")) || req.body?.orderSource === "WEBFLOW";
  if ((!env.WEBSITE_TURNSTILE_REQUIRED || !website) && token === undefined) {
    next();
    return;
  }
  try {
    await verifyWebsiteToken(token);
    next();
  } catch (error) {
    if (!(error instanceof WebsiteVerificationError)) throw error;
    res.set("Cache-Control", "no-store");
    res.status(error.unavailable ? 503 : 400).json({
      success: false,
      code: error.unavailable ? "HUMAN_VERIFICATION_UNAVAILABLE" : "HUMAN_VERIFICATION_REQUIRED",
      message: error.message
    });
  }
}
