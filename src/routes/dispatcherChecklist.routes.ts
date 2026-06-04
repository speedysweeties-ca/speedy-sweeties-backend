import { Router } from "express";
import { UserRole } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import {
  completeDispatcherChecklistItemController,
  getDispatcherChecklistHistoryController,
  getTodayDispatcherChecklistController
} from "../controllers/dispatcherChecklist.controller";

const router = Router();

router.get(
  "/today",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(getTodayDispatcherChecklistController)
);

router.patch(
  "/items/:itemId/complete",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(completeDispatcherChecklistItemController)
);

router.get(
  "/history",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(getDispatcherChecklistHistoryController)
);

export default router;