import { Router, Request, Response, NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth.middleware";
import { ADOPTED_COMPLETION_TIMEFRAME, ADOPTED_FISCAL_YEAR_END_MM_DD, ADOPTED_RETENTION_POLICY, PrivacyDeletionService, PrivacyError } from "../services/privacyDeletion.service";
import { privacyVerificationDelivery } from "../services/privacyDelivery.service";

const uuid = z.string().uuid();
const token = z.string().regex(/^[a-f0-9]{64}$/);
const body = <T>(schema: z.ZodType<T>, value: unknown) => { const r = schema.safeParse(value); if (!r.success) throw new PrivacyError(400, "INVALID_REQUEST"); return r.data; };
const bearer = (req: Request) => req.headers.authorization?.replace(/^Bearer /, "") || "";
const id = (req: Request) => body(uuid, req.params.id);
type Action = (req: Request, res: Response) => Promise<unknown>;
const safe = (fn: Action) => async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  try { await fn(req, res); } catch (e) {
    // Never expose Prisma errors, customer contacts, verification codes or provider responses.
    res.status(e instanceof PrivacyError ? e.status : 503).json({ code: e instanceof PrivacyError ? e.code : "PRIVACY_SERVICE_UNAVAILABLE" });
  }
};
export function privacyAdminOnly(req: Request, res: Response, next: NextFunction) {
  const user = (req as Request & { user?: { userId: string; role: string } }).user;
  const allowed = (process.env.PRIVACY_ADMIN_USER_IDS || "").split(",").filter(Boolean);
  if (!user || user.role !== "ADMIN" || !allowed.includes(user.userId)) { res.status(403).json({ code: "PRIVACY_ADMIN_REQUIRED" }); return; }
  next();
}
export function privacyEnabledOnly(injected: boolean) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.set("Cache-Control", "no-store");
    if (!injected && process.env.PRIVACY_DELETION_ENABLED !== "true") {
      res.status(503).json({ code: "PRIVACY_SERVICE_UNAVAILABLE" });
      return;
    }
    next();
  };
}
export function privacyRouter(service?: PrivacyDeletionService) {
  const router = Router();
  const injected = service !== undefined;
  router.use(privacyEnabledOnly(injected));
  router.use(rateLimit({ windowMs: 15 * 60000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false }));
  const get = () => service ??= new PrivacyDeletionService(prisma, process.env.PRIVACY_DIGEST_KEY || env.JWT_SECRET, privacyVerificationDelivery({
    resendApiKey: env.RESEND_API_KEY,
    resendFrom: process.env.PRIVACY_VERIFICATION_FROM || "",
    emailEnabled: process.env.PRIVACY_VERIFICATION_EMAIL_ENABLED === "true",
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
    twilioVerifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || "",
    phoneEnabled: process.env.PRIVACY_VERIFICATION_PHONE_ENABLED === "true"
  }), decision => process.env.PRIVACY_FULFILLMENT_ENABLED === "true" &&
    !!process.env.PRIVACY_DIGEST_KEY && !!process.env.PRIVACY_APPROVED_RETENTION_POLICY &&
    process.env.PRIVACY_APPROVED_RETENTION_POLICY === ADOPTED_RETENTION_POLICY &&
    process.env.PRIVACY_COMPLETION_TIMEFRAME === ADOPTED_COMPLETION_TIMEFRAME &&
    process.env.PRIVACY_FISCAL_YEAR_END_MM_DD === ADOPTED_FISCAL_YEAR_END_MM_DD &&
    decision?.policyReference === process.env.PRIVACY_APPROVED_RETENTION_POLICY,
    process.env.PRIVACY_COMPLETION_TIMEFRAME === ADOPTED_COMPLETION_TIMEFRAME
      ? ADOPTED_COMPLETION_TIMEFRAME : "",
    process.env.PRIVACY_FISCAL_YEAR_END_MM_DD || "");
  router.post("/challenges", safe(async (req, res) => {
    const input = body(z.object({
      trackingToken: z.string().min(32).max(128).optional(),
      loyaltyToken: z.string().min(32).max(2048).optional()
    }).strict(), req.body);
    res.json(await get().challenge({ ...input, accessToken: bearer(req) || undefined }, req.ip || "unknown"));
  }));
  router.post("/challenges/:id/verify", safe(async (req, res) => {
    const input = body(z.object({ code: z.string().regex(/^\d{4,10}$/), accessToken: token.optional() }).strict(), req.body);
    res.json(await get().verify(id(req), input.code, bearer(req) || input.accessToken));
  }));
  router.post("/requests", safe(async (req, res) => {
    const input = body(z.object({ id: uuid, token, challengeId: uuid, proof: token }).strict(), req.body);
    res.status(202).json(await get().submit({ ...input, accessToken: bearer(req) }));
  }));
  router.get("/requests/:id", safe(async (req, res) => { res.json(await get().status(id(req), bearer(req))); }));
  router.post("/requests/:id/cancel", safe(async (req, res) => { res.json(await get().cancel(id(req), bearer(req))); }));
  router.use("/admin", requireAuth, privacyAdminOnly);
  router.get("/admin/requests", safe(async (req, res) => {
    const after = req.query.after === undefined ? undefined : body(uuid, req.query.after);
    const rows = await get().db.privacyDeletionRequest.findMany({ take: 101, orderBy: { id: "asc" },
      ...(after ? { cursor: { id: after }, skip: 1 } : {}), select: {
      id: true, status: true, version: true, createdAt: true, dueAt: true, updatedAt: true, databaseErasedAt: true,
      closedAt: true, requestAuditReviewAt: true, summary: true, tasks: true, audit: true
    } });
    res.json({ requests: rows.slice(0, 100), next: rows.length > 100 ? rows[99].id : null });
  }));
  router.get("/admin/requests/:id/preview", safe(async (req, res) => { res.json(await get().impact(id(req))); }));
  router.post("/admin/requests/:id/fulfill", safe(async (req, res) => {
    const input = body(z.object({ version: z.number().int().nonnegative(), previewHash: token, decision: z.unknown() }).strict(), req.body);
    res.json(await get().fulfill(id(req), (req as any).user.userId, input.version, input.previewHash, input.decision));
  }));
  router.post("/admin/requests/:id/external", safe(async (req, res) => {
    const input = body(z.object({ system: z.string(), evidence: z.string(), retainUntil: z.string().optional() }).strict(), req.body);
    res.json(await get().resolveExternal(id(req), (req as any).user.userId, input.system, input.evidence, input.retainUntil));
  }));
  router.post("/admin/requests/:id/complete", safe(async (req, res) => { res.json(await get().complete(id(req), (req as any).user.userId)); }));
  return router;
}
export default privacyRouter();
