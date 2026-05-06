import { Router } from "express";
import { UserRole } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import {
  getCustomerByIdController,
  listCustomersController,
  searchCustomersController,
  updateCustomerController,
  updateCustomerDispatcherNotesController
} from "../controllers/customer.controller";

const router = Router();

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