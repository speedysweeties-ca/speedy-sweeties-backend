import { Router, Request, Response } from "express";
import { notificationRegistrationRateLimiter } from "../middleware/notificationRegistrationRateLimiter";

const router = Router();

router.post("/fcm-token", notificationRegistrationRateLimiter, (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: "Token is required"
    });
  }

  console.log("Customer FCM token registration received");

  return res.status(200).json({
    success: true,
    message: "Token saved"
  });
});

export default router;
