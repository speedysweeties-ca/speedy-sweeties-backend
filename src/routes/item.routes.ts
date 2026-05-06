import { Router } from "express";
import { UserRole } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import {
  deactivateCatalogItemController,
  listCatalogItemsController,
  searchItemsController,
  updateCatalogItemController
} from "../controllers/item.controller";

const router = Router();

// ✅ PUBLIC — customer app autocomplete search
router.get(
  "/search",
  asyncHandler(searchItemsController)
);

// 🔒 STAFF — list/search full catalog, including active/inactive filters
router.get(
  "/",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(listCatalogItemsController)
);

// 🔒 STAFF — edit catalog item details
router.patch(
  "/:id",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(updateCatalogItemController)
);

// 🔒 STAFF — deactivate bad/misspelled catalog item
router.patch(
  "/:id/deactivate",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(deactivateCatalogItemController)
);

export default router;