import { Router, Request, Response } from "express";
import { saveCustomerFcmToken } from "../services/pushNotification.service";

const router = Router();

router.post("/fcm-token", (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: "Token is required"
    });
  }

  saveCustomerFcmToken(token);

  console.log("🔥 Saved FCM Token:", token);

  return res.status(200).json({
    success: true,
    message: "Token saved"
  });
});

export default router;