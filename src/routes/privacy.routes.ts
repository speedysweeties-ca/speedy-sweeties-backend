import { Router, Request, Response, NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth.middleware";
import { PrivacyDeletionService, PrivacyError } from "../services/privacyDeletion.service";
import { resendPrivacyDelivery } from "../services/privacyDelivery.service";

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
export function privacyRouter(service?: PrivacyDeletionService) {
  const router = Router();
  const injected = service !== undefined;
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!injected && process.env.PRIVACY_DELETION_ENABLED !== "true") { res.status(503).json({ code: "PRIVACY_SERVICE_UNAVAILABLE" }); return; }
    next();
  });
  router.use(rateLimit({ windowMs: 15 * 60000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false }));
  const get = () => service ??= new PrivacyDeletionService(prisma, process.env.PRIVACY_DIGEST_KEY || env.JWT_SECRET, resendPrivacyDelivery({
    apiKey: env.RESEND_API_KEY, from: process.env.PRIVACY_VERIFICATION_FROM || "", enabled: process.env.PRIVACY_VERIFICATION_EMAIL_ENABLED === "true"
  }), decision => process.env.PRIVACY_FULFILLMENT_ENABLED === "true" &&
    !!process.env.PRIVACY_DIGEST_KEY && !!process.env.PRIVACY_APPROVED_RETENTION_POLICY &&
    decision?.policyReference === process.env.PRIVACY_APPROVED_RETENTION_POLICY);
  router.post("/challenges", safe(async (req, res) => {
    const input = body(z.object({ phone: z.string().min(7).max(30) }).strict(), req.body);
    res.json(await get().challenge(input.phone, req.ip || "unknown"));
  }));
  router.post("/challenges/:id/verify", safe(async (req, res) => {
    const input = body(z.object({ code: z.string().regex(/^\d{8}$/) }).strict(), req.body);
    res.json(await get().verify(id(req), input.code));
  }));
  router.post("/requests", safe(async (req, res) => {
    const input = body(z.object({ id: uuid, token, challengeId: uuid, proof: token }).strict(), req.body);
    res.status(202).json(await get().submit(input));
  }));
  router.get("/requests/:id", safe(async (req, res) => { res.json(await get().status(id(req), bearer(req))); }));
  router.post("/requests/:id/cancel", safe(async (req, res) => { res.json(await get().cancel(id(req), bearer(req))); }));
  router.use("/admin", requireAuth, privacyAdminOnly);
  router.get("/admin/requests", safe(async (req, res) => {
    const after = req.query.after === undefined ? undefined : body(uuid, req.query.after);
    const rows = await get().db.privacyDeletionRequest.findMany({ take: 101, orderBy: { id: "asc" },
      ...(after ? { cursor: { id: after }, skip: 1 } : {}), select: {
      id: true, status: true, version: true, createdAt: true, updatedAt: true, summary: true, tasks: true, audit: true
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
