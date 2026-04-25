import { Request, Response, NextFunction } from "express";
import { verifyAuthToken } from "../utils/jwt";

export const requireAuth = (
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
    const payload = verifyAuthToken(token);

    (req as any).user = payload;

    next();
  } catch (error) {
    res.status(401).json({
      message: "Invalid or expired token"
    });
  }
};