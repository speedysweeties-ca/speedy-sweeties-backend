import { createHash } from "crypto";
import { Router, Request, Response } from "express";
import { notificationRegistrationRateLimiter } from "../middleware/notificationRegistrationRateLimiter";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();
const CUSTOMER_FCM_SETTING_PREFIX = "customerFcmToken:";

const getCustomerFcmSettingKey = (token: string): string =>
  `${CUSTOMER_FCM_SETTING_PREFIX}${createHash("sha256").update(token).digest("hex")}`;

router.post(
  "/fcm-token",
  notificationRegistrationRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";

    if (!token || token.length < 20 || token.length > 4096) {
      return res.status(400).json({
        success: false,
        message: "A valid FCM token is required"
      });
    }

    const key = getCustomerFcmSettingKey(token);

    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: token },
      create: {
        key,
        value: token
      }
    });

    return res.status(200).json({
      success: true,
      message: "Token saved"
    });
  })
);

export default router;
