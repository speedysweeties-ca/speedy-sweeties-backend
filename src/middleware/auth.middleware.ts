import { Request, Response, NextFunction } from "express";
import { verifyAuthToken } from "../utils/jwt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      message: "Unauthorized"
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload: any = verifyAuthToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    });

    if (!user) {
      res.status(401).json({
        message: "User not found"
      });
      return;
    }

    // 🔥 FORCE LOGOUT CHECK
    if (user.forceLogoutAt) {
      res.status(401).json({
        message: "FORCE_LOGOUT"
      });
      return;
    }

    (req as any).user = payload;

    next();
  } catch (error) {
    res.status(401).json({
      message: "Invalid or expired token"
    });
  }
};