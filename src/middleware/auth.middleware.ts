import { Request, Response, NextFunction } from "express";
import { verifyAuthToken, verifyExpiredAuthTokenForAudit } from "../utils/jwt";
import { prisma } from "../lib/prisma";
import { recordSessionEvent, SessionReason } from "../services/staffSessionLog.service";

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
    const expired = verifyExpiredAuthTokenForAudit(token);
    if (expired) recordSessionEvent(req, expired, "TOKEN_EXPIRED", "SESSION_REJECTED");
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
    recordSessionEvent(req, payload, "DATABASE_UNAVAILABLE", "CHECK_INTERRUPTED");
    res.set("Retry-After", "5").status(503).json({
      code: "AUTH_SERVICE_UNAVAILABLE",
      message: "Unable to verify your sign-in right now. Please try again shortly."
    });
    return;
  }

  if (!user) {
    recordSessionEvent(req, payload, "ACCOUNT_NOT_FOUND", "SESSION_REJECTED");
    res.status(401).json({ message: "User not found" });
    return;
  }

  if (!user.isActive) {
    recordSessionEvent(req, user, "ACCOUNT_DEACTIVATED", "SESSION_REJECTED");
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  if (user.passwordChangeRequired || (payload.authVersion ?? 0) !== (user.authVersion ?? 0)) {
    const reason: SessionReason = user.passwordChangeRequired ? "PASSWORD_CHANGE_REQUIRED" :
      user.forceLogoutAt ? (user.role === "DRIVER" && !user.isVisibleInDispatch ? "DRIVER_HIDDEN" : "FORCE_LOGOUT") : "SESSION_REVOKED";
    recordSessionEvent(req, user, reason, "SESSION_REJECTED");
    res.status(401).json({ message: "Your sign-in has expired. Please sign in again." });
    return;
  }

  if (user.forceLogoutAt) {
    recordSessionEvent(req, user, "FORCE_LOGOUT", "SESSION_REJECTED");
    res.status(401).json({ message: "FORCE_LOGOUT" });
    return;
  }

  (req as any).user = {
    ...payload,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName
  };

  next();
};
