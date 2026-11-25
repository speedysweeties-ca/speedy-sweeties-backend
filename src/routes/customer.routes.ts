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

import { listCustomerAddressesController, mutateCustomerAddressController } from "../controllers/customerAddress.controller";

const router = Router();
const addressStaff = [requireAuth, requireRole([UserRole.ADMIN, UserRole.DISPATCHER])];
router.get("/:id/addresses", ...addressStaff, asyncHandler(listCustomerAddressesController));
router.post("/:id/addresses", ...addressStaff, asyncHandler(mutateCustomerAddressController));
router.put("/:id/addresses/:addressId", ...addressStaff, asyncHandler(mutateCustomerAddressController));
router.delete("/:id/addresses/:addressId", ...addressStaff, asyncHandler(mutateCustomerAddressController));

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
