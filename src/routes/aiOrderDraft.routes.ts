import { Router } from "express";
import { createAiOrderDraftController } from "../controllers/aiOrderDraft.controller";
import { aiOrderDraftRateLimiter } from "../middleware/aiOrderDraftRateLimiter";
import { validateRequest } from "../middleware/validateRequest";
import { asyncHandler } from "../utils/asyncHandler";
import { aiOrderDraftRequestSchema } from "../validators/aiOrderDraft.validator";

const router = Router();

router.post(
  "/order-draft",
  aiOrderDraftRateLimiter,
  validateRequest(aiOrderDraftRequestSchema),
  asyncHandler(createAiOrderDraftController)
);

export default router;
