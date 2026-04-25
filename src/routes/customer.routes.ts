import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth.middleware";
import {
  searchCustomersController,
  updateCustomerDispatcherNotesController
} from "../controllers/customer.controller";

const router = Router();

router.get(
  "/search",
  requireAuth,
  asyncHandler(searchCustomersController)
);

router.patch(
  "/:id/dispatcher-notes",
  requireAuth,
  asyncHandler(updateCustomerDispatcherNotesController)
);

export default router;