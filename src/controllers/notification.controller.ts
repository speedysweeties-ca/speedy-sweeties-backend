import { createHash } from "crypto";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

const CUSTOMER_FCM_SETTING_PREFIX = "customerFcmToken:";

export const getCustomerFcmSettingKey = (token: string): string =>
  `${CUSTOMER_FCM_SETTING_PREFIX}${createHash("sha256").update(token).digest("hex")}`;

export const registerCustomerFcmTokenController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";

  if (!token || token.length < 20 || token.length > 4096) {
    res.status(400).json({
      success: false,
      message: "A valid FCM token is required"
    });
    return;
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

  res.status(200).json({
    success: true,
    message: "Token saved"
  });
};
