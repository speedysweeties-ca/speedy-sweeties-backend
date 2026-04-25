import { Router, Request, Response } from "express";
import admin from "firebase-admin";

const router = Router();

// TEMP shared memory (same as notification route)
let savedTokens: string[] = [];

export const addToken = (token: string) => {
  if (!savedTokens.includes(token)) {
    savedTokens.push(token);
  }
};

router.post("/send", async (_req: Request, res: Response) => {
  if (savedTokens.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No tokens available"
    });
  }

  try {
    const results = [];

    for (const token of savedTokens) {
      const message = {
        token,
        notification: {
          title: "Speedy Sweeties 🚀",
          body: "Test notification working!"
        }
      };

      const response = await admin.messaging().send(message);
      results.push(response);
    }

    return res.status(200).json({
      success: true,
      message: "Push sent to all tokens",
      results
    });

  } catch (error) {
    console.error("Push error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send push"
    });
  }
});

export default router;