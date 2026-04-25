import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";

export type AuthTokenPayload = {
  userId: string;
  email: string;
  role: UserRole;
};

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not set in environment variables.");
  }

  return secret;
};

export const signAuthToken = (payload: AuthTokenPayload): string => {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "7d"
  });
};

export const verifyAuthToken = (token: string): AuthTokenPayload => {
  return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
};