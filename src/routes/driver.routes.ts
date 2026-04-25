import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { UserRole } from "@prisma/client";
import { getDriverOrdersController } from "../controllers/driverOrders.controller";
import { heartbeatDriverController } from "../controllers/driverPresence.controller";

const router = Router();

/**
 * GET DRIVER ORDERS
 * - Driver fetches their assigned orders
 * - Automatically marks PLACED → ACCEPTED
 */
router.get(
  "/orders",
  requireAuth,
  requireRole([UserRole.DRIVER]),
  asyncHandler(getDriverOrdersController)
);

/**
 * DRIVER HEARTBEAT
 * - Keeps driver marked as online
 */
router.post(
  "/heartbeat",
  requireAuth,
  requireRole([UserRole.DRIVER]),
  asyncHandler(heartbeatDriverController)
);

export default router;