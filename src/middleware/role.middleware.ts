import { Request, Response, NextFunction, RequestHandler } from "express";
import { UserRole } from "@prisma/client";

export const requireRole = (allowedRoles: UserRole[]): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({
        message: "Unauthorized"
      });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        message: "Forbidden"
      });
      return;
    }

    next();
  };
};