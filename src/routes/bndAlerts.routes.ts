import { Router } from "express";
import { UserRole } from "@prisma/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { getBndMonitorStatus } from "../services/bndOrderMonitor.service";

const router = Router();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.use(requireAuth, requireRole([UserRole.ADMIN, UserRole.DISPATCHER]));
// Reading this cache never triggers extra requests to B&D or claims an order.
router.get("/status", (_req, res) => { res.json(getBndMonitorStatus()); });
export default router;
