import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { env } from "../config/env";

export type AuthTokenPayload = {
  userId: string;
  email: string;
  role: UserRole;
};

const getJwtSecret = (): string => {
  return env.JWT_SECRET;
};

export const signAuthToken = (payload: AuthTokenPayload): string => {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "7d"
  });
};

export const verifyAuthToken = (token: string): AuthTokenPayload => {
  return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
};