import { Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { hashPassword, comparePassword } from "../utils/hash";
import { signAuthToken, signPasswordChangeToken } from "../utils/jwt";
import { prisma } from "../lib/prisma";

type RegisterUserBody = {
  email: string;
  password: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
};

type LoginBody = {
  email: string;
  password: string;
  passwordChangeOnly?: boolean;
};

type UpdateMyProfileBody = {
  firstName?: string;
  lastName?: string;
};

type AuthenticatedUser = {
  userId: string;
  email: string;
  role: string;
};

const getAuthUser = (req: Request): AuthenticatedUser | undefined => {
  return (req as Request & { user?: AuthenticatedUser }).user;
};

const publicUserSelect = {
  id: true,
  email: true,
  role: true,
  firstName: true,
  lastName: true,
  isActive: true,
  isOnline: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true
} as const;

export const registerUserController = async (
  req: Request<{}, {}, RegisterUserBody>,
  res: Response
): Promise<void> => {
  const { email, password, role, firstName, lastName } = req.body;

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (existingUser) {
    res.status(409).json({
      message: "A user with that email already exists."
    });
    return;
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      role,
      firstName: firstName?.trim() || null,
      lastName: lastName?.trim() || null
    },
    select: publicUserSelect
  });

  res.status(201).json({
    message: "User created successfully.",
    user
  });
};

export const loginController = async (
  req: Request<{}, {}, LoginBody>,
  res: Response
): Promise<void> => {
  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    res.status(400).json({ message: "Enter your email and password." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (!user) {
    res.status(401).json({
      message: "Invalid email or password"
    });
    return;
  }

  const isValid = await comparePassword(password, user.passwordHash);

  if (!isValid) {
    res.status(401).json({
      message: "Invalid email or password"
    });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ message: "This staff account is deactivated. Contact your administrator." });
    return;
  }

  if (user.passwordChangeRequired || req.body.passwordChangeOnly === true) {
    res.set("Cache-Control", "no-store").status(403).json({
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "Choose your own password at https://speedy-dispatcher.onrender.com/?staff-password=1, then sign in again.",
      resetToken: signPasswordChangeToken(user.id, user.authVersion ?? 0),
    });
    return;
  }

  if (user.role === UserRole.DRIVER && !user.isVisibleInDispatch) {
    res.status(403).json({
      message: "This driver is currently hidden from dispatch. Contact dispatch for access."
    });
    return;
  }

  // An account change during password verification must not issue a usable old session.
  const signedIn = await prisma.user.updateMany({
    where: { id: user.id, isActive: true, authVersion: user.authVersion ?? 0, passwordHash: user.passwordHash, passwordChangeRequired: false },
    data: { forceLogoutAt: null, ...(user.role === UserRole.DRIVER ? { isOnline: true, lastSeenAt: new Date() } : {}) },
  });
  if (signedIn.count !== 1) {
    res.status(401).json({ message: "Account details changed. Please sign in again." });
    return;
  }

  const token = signAuthToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    authVersion: user.authVersion ?? 0,
  });

  res.set("Cache-Control", "no-store").status(200).json({
    message: "Login successful",
    token,
    role: user.role
  });
};

export const getMyProfileController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    res.status(401).json({
      message: "Unauthorized"
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.userId },
    select: publicUserSelect
  });

  if (!user) {
    res.status(404).json({
      message: "User not found"
    });
    return;
  }

  res.status(200).json({
    message: "Profile fetched successfully",
    user
  });
};

export const updateMyProfileController = async (
  req: Request<{}, {}, UpdateMyProfileBody>,
  res: Response
): Promise<void> => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    res.status(401).json({
      message: "Unauthorized"
    });
    return;
  }

  const firstName =
    typeof req.body.firstName === "string" ? req.body.firstName.trim() : undefined;
  const lastName =
    typeof req.body.lastName === "string" ? req.body.lastName.trim() : undefined;

  const user = await prisma.user.findUnique({
    where: { id: authUser.userId }
  });

  if (!user) {
    res.status(404).json({
      message: "User not found"
    });
    return;
  }

  const updatedUser = await prisma.user.update({
    where: { id: authUser.userId },
    data: {
      staffRevision: { increment: 1 },
      ...(firstName !== undefined ? { firstName: firstName || null } : {}),
      ...(lastName !== undefined ? { lastName: lastName || null } : {})
    },
    select: publicUserSelect
  });

  res.status(200).json({
    message: "Profile updated successfully",
    user: updatedUser
  });
};
