import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth.middleware";
import { searchItemsController } from "../controllers/item.controller";

const router = Router();

router.get(
  "/search",
  requireAuth,
  asyncHandler(searchItemsController)
);

export default router;