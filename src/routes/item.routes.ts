import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { searchItemsController } from "../controllers/item.controller";

const router = Router();

// ✅ PUBLIC — customer app autocomplete search
router.get(
  "/search",
  asyncHandler(searchItemsController)
);

export default router;