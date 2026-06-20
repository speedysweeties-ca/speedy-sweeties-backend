import { Router } from "express";
import { UserRole } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { validateRequest } from "../middleware/validateRequest";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";

import {
  createOrderSchema,
  getOrderByIdSchema,
  updateOrderStatusSchema,
  updateOrderDetailsSchema
} from "../validators/order.validator";

import { assignDriverSchema } from "../validators/orderAssignment.validator";

import {
  createOrderController,
  getAutoDispatchSettingsController,
  getOrderByIdController,
  getPublicOrderTrackingController,
  updateAutoDispatchSettingsController,
  updateOrderStatusController,
  updateOrderPriorityController,
  updateOrderDetailsController
} from "../controllers/order.controller";

import { getOrderStatsController } from "../controllers/orderStats.controller";
import { assignDriverToOrderController } from "../controllers/orderAssignment.controller";
import { listAllOrdersController } from "../controllers/orderList.controller";
import { getDriverOrdersController } from "../controllers/driverOrders.controller";
import { driverActionController } from "../controllers/driverAction.controller";
import { getDriverStatsController } from "../controllers/driverStats.controller";

import {
  createOrUpdateReceiptController,
  getReceiptByOrderController
} from "../controllers/receipt.controller";

const router = Router();

// ✅ PUBLIC — customers create orders
router.post(
  "/",
  validateRequest(createOrderSchema),
  asyncHandler(createOrderController)
);

// ✅ PUBLIC — customer tracking by order ID
router.get(
  "/track/:id",
  asyncHandler(getPublicOrderTrackingController)
);

// 🔒 STAFF — auto-dispatch setting
// Primary route uses two path segments so it cannot be mistaken for /:id.
router.get(
  "/settings/auto-dispatch",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(getAutoDispatchSettingsController)
);

router.patch(
  "/settings/auto-dispatch",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(updateAutoDispatchSettingsController)
);

// Backward-compatible route. Keep this above every /:id route.
router.get(
  "/auto-dispatch",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(getAutoDispatchSettingsController)
);

router.patch(
  "/auto-dispatch",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(updateAutoDispatchSettingsController)
);

// 🔒 STAFF — stats
router.get(
  "/stats",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(getOrderStatsController)
);

// 🔥 DRIVER PERFORMANCE STATS
router.get(
  "/driver-stats",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(getDriverStatsController)
);

// 🔒 DRIVER — only their orders
router.get(
  "/my-orders",
  requireAuth,
  requireRole([UserRole.DRIVER]),
  asyncHandler(getDriverOrdersController)
);

// 🔒 STAFF — all orders (dispatcher view)
router.get(
  "/",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(listAllOrdersController)
);

// 🔒 STAFF — single order
router.get(
  "/:id",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  validateRequest(getOrderByIdSchema),
  asyncHandler(getOrderByIdController)
);

// 🔒 DRIVER — create/update digital receipt for assigned order
router.post(
  "/:id/receipt",
  requireAuth,
  requireRole([UserRole.DRIVER]),
  asyncHandler(createOrUpdateReceiptController)
);

// 🔒 STAFF + DRIVER — get digital receipt for order
router.get(
  "/:id/receipt",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER, UserRole.DRIVER]),
  asyncHandler(getReceiptByOrderController)
);

// 🔒 STAFF — assign driver
router.patch(
  "/:id/assign-driver",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  validateRequest(assignDriverSchema),
  asyncHandler(assignDriverToOrderController)
);

// 🔒 STAFF — edit order details/items
router.patch(
  "/:id/edit",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  validateRequest(updateOrderDetailsSchema),
  asyncHandler(updateOrderDetailsController)
);

// 🔥 NEW — update order priority
router.patch(
  "/:id/priority",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER]),
  asyncHandler(updateOrderPriorityController)
);

// 🔒 DRIVER — clean driver actions
router.post(
  "/:id/driver-action",
  requireAuth,
  requireRole([UserRole.DRIVER]),
  asyncHandler(driverActionController)
);

// 🔒 STAFF + DRIVER — update status (legacy)
router.patch(
  "/:id/status",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.DISPATCHER, UserRole.DRIVER]),
  validateRequest(updateOrderStatusSchema),
  asyncHandler(updateOrderStatusController)
);

export default router;