import { Router } from "express";
import { UserRole } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import {
  createPickupLocationController,
  deactivatePickupLocationController,
  listPickupLocationsController,
  updatePickupLocationController
} from "../controllers/pickupLocation.controller";

const router = Router();

// 🔒 STAFF — list pickup locations
router.get(
  "/",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(listPickupLocationsController)
);

// 🔒 STAFF — create pickup location
router.post(
  "/",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(createPickupLocationController)
);

// 🔒 STAFF — edit pickup location
router.patch(
  "/:id",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(updatePickupLocationController)
);

// 🔒 STAFF — deactivate pickup location
router.patch(
  "/:id/deactivate",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(deactivatePickupLocationController)
);

export default router;