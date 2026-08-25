import { Router } from "express";
import { UserRole } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { customerLoyaltyRateLimiter } from "../middleware/customerLoyaltyRateLimiter";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import {
  getCustomerByIdController,
  getCustomerLoyaltyController,
  getCustomerLoyaltyByTokenController,
  listCustomerRetentionController,
  listCustomersController,
  searchCustomersController,
  updateCustomerController,
  updateCustomerDispatcherNotesController
} from "../controllers/customer.controller";

const router = Router();

// 🌎 PUBLIC — customer app loyalty progress lookup
router.get(
  "/loyalty",
  customerLoyaltyRateLimiter,
  asyncHandler(getCustomerLoyaltyController)
);

router.get(
  "/loyalty-token",
  customerLoyaltyRateLimiter,
  asyncHandler(getCustomerLoyaltyByTokenController)
);

// 🔒 STAFF — search customers for manual order autocomplete
router.get(
  "/search",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(searchCustomersController)
);

// 🔒 STAFF — list/search customer profiles
router.get(
  "/",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(listCustomersController)
);

// 🔒 STAFF — customer retention / win-back dashboard
router.get(
  "/retention",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(listCustomerRetentionController)
);

// 🔒 STAFF — get one customer profile with recent order history
router.get(
  "/:id",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(getCustomerByIdController)
);

// 🔒 STAFF — edit full customer profile
router.patch(
  "/:id",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(updateCustomerController)
);

// 🔒 STAFF — edit dispatcher notes only
router.patch(
  "/:id/dispatcher-notes",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(updateCustomerDispatcherNotesController)
);

export default router;
