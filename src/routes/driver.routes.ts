import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { UserRole } from "@prisma/client";
import { getDriverOrdersController } from "../controllers/driverOrders.controller";
import {
  heartbeatDriverController,
  setDriverOfflineController,
  setDriverOnlineController
} from "../controllers/driverPresence.controller";

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
 * DRIVER ONLINE
 * - Marks driver as online
 */
router.post(
  "/online",
  requireAuth,
  requireRole([UserRole.DRIVER]),
  asyncHandler(setDriverOnlineController)
);

/**
 * DRIVER OFFLINE / LOGOUT
 * - Marks driver as offline when they log out from the app
 */
router.post(
  "/offline",
  requireAuth,
  requireRole([UserRole.DRIVER]),
  asyncHandler(setDriverOfflineController)
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