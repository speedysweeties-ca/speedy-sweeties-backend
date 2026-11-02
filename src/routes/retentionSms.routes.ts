import { Router } from "express";
import { prisma } from "../lib/prisma";
import { normalizeRetentionPhone, recordRetentionDelivery, suppressRetentionPhone, validTwilioSignature } from "../services/retentionSms.service";

const router = Router();
// Webhook verification remains available when sending is switched off.
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  const base = process.env.RETENTION_SMS_WEBHOOK_BASE || "";
  const token = process.env.RETENTION_TWILIO_AUTH_TOKEN || "";
  const account = process.env.RETENTION_TWILIO_ACCOUNT_SID || "";
  const key = process.env.RETENTION_SMS_SUPPRESSION_KEY || "";
  const params = req.body;
  if (!token || !base || !account || key.length < 32) return res.sendStatus(503);
  if (req.method !== "POST" || req.originalUrl.includes("?") || !req.is("application/x-www-form-urlencoded") || !params ||
      Object.values(params).some(v => typeof v !== "string") || params.AccountSid !== account ||
      !validTwilioSignature(token, base + req.path, params, req.get("X-Twilio-Signature") || "")) return res.sendStatus(403);
  next();
});
router.post("/inbound", async (req, res, next) => {
  try {
    const phone = normalizeRetentionPhone(req.body.From || "");
    const stopped = req.body.OptOutType === "STOP" || /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REVOKE|OPTOUT)$/i.test((req.body.Body || "").trim());
    if (phone && stopped) await suppressRetentionPhone(prisma, phone, process.env.RETENTION_SMS_SUPPRESSION_KEY!);
    // START never silently restores marketing consent. No application-generated reply SMS.
    res.type("text/xml").send("<Response/>");
  } catch { next(new Error("Retention unsubscribe processing failed")); }
});
router.post("/status/:id", async (req, res, next) => {
  try {
    await recordRetentionDelivery(prisma, String(req.params.id), req.body);
    res.sendStatus(204);
  } catch { next(new Error("Retention delivery processing failed")); }
});
export default router;
