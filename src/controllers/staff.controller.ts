import { Request, Response } from "express";
import { OrderStatus, Prisma, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import { hashPassword, comparePassword } from "../utils/hash";
import { verifyPasswordChangeToken } from "../utils/jwt";
import { lockStaffAccount } from "../utils/staffAccountLock";
import { staffProfileSchema, staffResetSchema, staffStatusSchema, passwordChangeSchema } from "../validators/staff.validator";

const staffSelect = {
  id: true, firstName: true, lastName: true, email: true, role: true,
  isActive: true, passwordChangeRequired: true, isVisibleInDispatch: true, staffRevision: true,
} as const;

export const listStaff = async (_req: Request, res: Response) => {
  const staff = await prisma.user.findMany({ select: staffSelect,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }] });
  res.set("Cache-Control", "no-store").json({ staff });
};

export const forceLogoutDispatcher = async (req: Request, res: Response) => {
  const now = new Date();
  // Check the role in the write itself so a concurrent role change cannot log out an administrator.
  const result = await prisma.user.updateMany({
    where: { id: String(req.params.id), role: UserRole.DISPATCHER },
    data: {
      isOnline: false,
      authVersion: { increment: 1 },
      staffRevision: { increment: 1 },
      lastSeenAt: now,
      forceLogoutAt: now,
    },
  });
  if (result.count !== 1) throw new ApiError(404, "Dispatcher not found.");
  res.set("Cache-Control", "no-store").json({ success: true, message: "Dispatcher has been logged out successfully." });
};

type Change = { kind: "profile"; body: Prisma.UserUpdateManyMutationInput; role: UserRole; email: string }
  | { kind: "status"; isActive: boolean }
  | { kind: "password"; passwordHash: string };

const changeStaff = async (req: Request, staffRevision: number, change: Change) => {
  const actorId = (req as Request & { user: { userId: string } }).user.userId;
  const id = String(req.params.id);
  try {
    return await prisma.$transaction(async tx => {
      await lockStaffAccount(tx, id);
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new ApiError(404, "Staff member not found.");
      if (user.role === "ADMIN" || user.id === actorId) {
        throw new ApiError(403, "Administrator accounts cannot be changed from staff management.");
      }
      if (user.staffRevision !== staffRevision) {
        throw new ApiError(409, "This profile changed. Cancel this edit, refresh the staff list, then try again.");
      }
      const accessChanges = change.kind === "password" ||
        (change.kind === "status" && !change.isActive) ||
        (change.kind === "profile" && (change.role !== user.role || change.email !== user.email));
      if (accessChanges && user.role === "DRIVER") {
        const unfinished = await tx.order.count({ where: { assignedDriverId: id,
          orderStatus: { in: [OrderStatus.PLACED, OrderStatus.DISPATCHED, OrderStatus.ACCEPTED, OrderStatus.OUT_FOR_DELIVERY] } } });
        if (unfinished > 0) throw new ApiError(409,
          `This driver has ${unfinished} unfinished ${unfinished === 1 ? "delivery" : "deliveries"}. Finish or reassign them in Live Orders before changing their access.`);
      }
      if (change.kind === "password" && !user.isActive) {
        throw new ApiError(409, "Reactivate this staff member before resetting their password.");
      }
      const data: Prisma.UserUpdateManyMutationInput = change.kind === "profile" ? change.body :
        change.kind === "status" ? { isActive: change.isActive } :
          { passwordHash: change.passwordHash, passwordChangeRequired: true };
      data.staffRevision = { increment: 1 };
      const revokeSessions = accessChanges || (change.kind === "status" && change.isActive !== user.isActive);
      if (revokeSessions) Object.assign(data, {
        authVersion: { increment: 1 }, isOnline: false, forceLogoutAt: null,
        driverFcmToken: null, latitude: null, longitude: null, locationUpdatedAt: null,
      });
      const result = await tx.user.updateMany({ where: { id, staffRevision: user.staffRevision, role: user.role }, data });
      if (result.count !== 1) throw new ApiError(409, "This profile changed. Cancel this edit, refresh the staff list, then try again.");
      return tx.user.findUnique({ where: { id }, select: staffSelect });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new ApiError(409, "Another staff account already uses this email address.");
      if (error.code === "P2034") throw new ApiError(409, "Staff or delivery details changed. Cancel this edit, refresh the list, then try again.");
    }
    throw error;
  }
};

export const updateStaffProfile = async (req: Request, res: Response) => {
  const { body } = staffProfileSchema.parse({ body: req.body, params: req.params });
  const { staffRevision, ...profile } = body;
  const user = await changeStaff(req, staffRevision, { kind: "profile", body: profile, role: profile.role, email: profile.email });
  res.json({ user, message: "Staff profile saved." });
};

export const updateStaffStatus = async (req: Request, res: Response) => {
  const { body } = staffStatusSchema.parse({ body: req.body, params: req.params });
  const user = await changeStaff(req, body.staffRevision, { kind: "status", isActive: body.isActive });
  res.json({ user, message: body.isActive ? "Account reactivated. They can sign in again." : "Account deactivated and signed out. Past deliveries and performance records are preserved." });
};

export const resetStaffPassword = async (req: Request, res: Response) => {
  const { body } = staffResetSchema.parse({ body: req.body, params: req.params });
  const passwordHash = await hashPassword(body.temporaryPassword);
  const user = await changeStaff(req, body.staffRevision, { kind: "password", passwordHash });
  res.json({ user, message: "Temporary password saved. Share it privately along with the staff password page." });
};

export const changeStaffPassword = async (req: Request, res: Response) => {
  const { body } = passwordChangeSchema.parse({ body: req.body });
  let payload;
  try { payload = verifyPasswordChangeToken(body.resetToken); }
  catch { throw new ApiError(401, "Password change session expired. Sign in with your temporary password again."); }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive || (user.authVersion ?? 0) !== payload.authVersion) {
    throw new ApiError(401, "Password change session expired. Sign in again.");
  }
  if (await comparePassword(body.password, user.passwordHash)) {
    throw new ApiError(400, "Choose a different password from your temporary or current password.");
  }
  const passwordHash = await hashPassword(body.password);
  const result = await prisma.user.updateMany({
    where: { id: user.id, isActive: true, authVersion: payload.authVersion },
    data: { passwordHash, passwordChangeRequired: false, staffRevision: { increment: 1 }, authVersion: { increment: 1 },
      isOnline: false, forceLogoutAt: null, driverFcmToken: null },
  });
  if (result.count !== 1) throw new ApiError(401, "Password change session expired. Sign in again.");
  res.set("Cache-Control", "no-store").json({ message: "Password changed successfully.", role: user.role });
};
