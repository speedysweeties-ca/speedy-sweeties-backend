import { Router } from "express";
import { UserRole } from "@prisma/client";
import { getOrderRoutingPreviewController } from "../controllers/routingPreview.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get(
  "/orders/:orderId",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(getOrderRoutingPreviewController)
);

export default router;
