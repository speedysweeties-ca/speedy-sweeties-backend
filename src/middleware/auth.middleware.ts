import { Request, Response, NextFunction } from "express";
import { verifyAuthToken } from "../utils/jwt";
import { prisma } from "../lib/prisma";

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const token = authHeader.split(" ")[1];
  let payload: ReturnType<typeof verifyAuthToken>;

  // Only an invalid token is an authentication failure. A database interruption
  // must not tell the dispatcher or driver apps to discard a valid session.
  try {
    payload = verifyAuthToken(token);
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }

  let user: Awaited<ReturnType<typeof prisma.user.findUnique>>;
  try {
    user = await prisma.user.findUnique({
      where: { id: payload.userId }
    });
  } catch {
    // Prisma logs the database error. Do not log tokens or account data here.
    console.error("[auth] Staff account lookup unavailable");
    res.set("Retry-After", "5").status(503).json({
      code: "AUTH_SERVICE_UNAVAILABLE",
      message: "Unable to verify your sign-in right now. Please try again shortly."
    });
    return;
  }

  if (!user) {
    res.status(401).json({ message: "User not found" });
    return;
  }

  if (!user.isActive) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  if (user.passwordChangeRequired || (payload.authVersion ?? 0) !== (user.authVersion ?? 0)) {
    res.status(401).json({ message: "Your sign-in has expired. Please sign in again." });
    return;
  }

  if (user.forceLogoutAt) {
    res.status(401).json({ message: "FORCE_LOGOUT" });
    return;
  }

  (req as any).user = {
    ...payload,
    email: user.email,
    role: user.role
  };

  next();
};
