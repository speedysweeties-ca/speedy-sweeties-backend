import { Router } from "express";
import { UserRole } from "@prisma/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { getBndMonitorStatus } from "../services/bndOrderMonitor.service";
import { getBndEmailSettings, saveBndEmailEnabled } from "../services/bndEmailAlerts.service";

const router = Router();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.use(requireAuth, requireRole([UserRole.ADMIN, UserRole.DISPATCHER]));
// Reading this cache never triggers extra requests to B&D or claims an order.
router.get("/status", (_req, res) => { res.json(getBndMonitorStatus()); });
// Protect both reads and writes with the current database-backed admin role.
router.get("/email-settings", requireRole([UserRole.ADMIN]), async (_req, res) => {
  res.json(await getBndEmailSettings());
});
router.put("/email-settings", requireRole([UserRole.ADMIN]), async (req, res) => {
  if (!req.body || typeof req.body.enabled !== "boolean" || Object.keys(req.body).some(key => key !== "enabled")) {
    res.status(400).json({ message: "Send only an enabled boolean." });
    return;
  }
  const settings = await getBndEmailSettings();
  if (req.body.enabled && !settings.configured) {
    res.status(503).json({ message: "Email setup needs attention before B&D emails can be enabled." });
    return;
  }
  res.json(await saveBndEmailEnabled(req.body.enabled));
});
export default router;
