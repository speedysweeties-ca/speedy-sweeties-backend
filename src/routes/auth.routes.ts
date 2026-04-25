import { Router } from "express";
import { UserRole } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { validateRequest } from "../middleware/validateRequest";
import { registerUserSchema } from "../validators/auth.validator";
import {
  registerUserController,
  loginController,
  getMyProfileController,
  updateMyProfileController
} from "../controllers/auth.controller";
import { getAllDriversWithStatsController } from "../controllers/driverList.controller";
import {
  setDriverOnlineController,
  setDriverOfflineController,
  heartbeatDriverController
} from "../controllers/driverPresence.controller";
import { forceLogoutDriverController } from "../controllers/adminDriver.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

router.post(
  "/register",
  validateRequest(registerUserSchema),
  asyncHandler(registerUserController)
);

router.post(
  "/login",
  asyncHandler(loginController)
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(getMyProfileController)
);

router.patch(
  "/me",
  requireAuth,
  asyncHandler(updateMyProfileController)
);

/**
 * DRIVER PRESENCE (ONLINE / OFFLINE / HEARTBEAT)
 */
router.post(
  "/driver/online",
  requireAuth,
  requireRole([UserRole.DRIVER]),
  asyncHandler(setDriverOnlineController)
);

router.post(
  "/driver/offline",
  requireAuth,
  requireRole([UserRole.DRIVER]),
  asyncHandler(setDriverOfflineController)
);

router.post(
  "/driver/heartbeat",
  requireAuth,
  requireRole([UserRole.DRIVER]),
  asyncHandler(heartbeatDriverController)
);

/**
 * DRIVER LIST (ONLY SHOW ONLINE DRIVERS)
 */
router.get(
  "/drivers",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(getAllDriversWithStatsController)
);

/**
 * FORCE LOGOUT DRIVER (DISPATCHER / ADMIN)
 */
router.patch(
  "/drivers/:id/force-logout",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(forceLogoutDriverController)
);

router.get(
  "/admin-only",
  requireAuth,
  requireRole([UserRole.ADMIN]),
  asyncHandler(async (_req, res) => {
    res.status(200).json({
      message: "Welcome, admin"
    });
  })
);

export default router;