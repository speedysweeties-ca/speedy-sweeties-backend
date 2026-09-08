import { Router } from "express";
import { notificationRegistrationRateLimiter } from "../middleware/notificationRegistrationRateLimiter";
import { registerCustomerFcmTokenController } from "../controllers/notification.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.post(
  "/fcm-token",
  notificationRegistrationRateLimiter,
  asyncHandler(registerCustomerFcmTokenController)
);

export default router;
