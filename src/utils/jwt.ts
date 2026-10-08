import jwt from "jsonwebtoken";
import { createHmac } from "crypto";
import { UserRole } from "@prisma/client";
import { env } from "../config/env";

export type AuthTokenPayload = {
  userId: string;
  email: string;
  role: UserRole;
  authVersion?: number;
};

export type CustomerLoyaltyTokenPayload = {
  sub: string;
  scope: "customer-loyalty";
};

const getJwtSecret = (): string => {
  return env.JWT_SECRET;
};

const getCustomerLoyaltyJwtSecret = (): string =>
  createHmac("sha256", getJwtSecret())
    .update("speedy-customer-loyalty-v1")
    .digest("hex");

export const signAuthToken = (payload: AuthTokenPayload): string => {
  return jwt.sign(payload, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: "7d"
  });
};

export const verifyAuthToken = (token: string): AuthTokenPayload => {
  return jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"]
  }) as AuthTokenPayload;
};

// Attribution only: verify the signature even when expired. Never use this
// helper to authorize a request or trust an unsigned decoded payload.
export const verifyExpiredAuthTokenForAudit = (token: string): AuthTokenPayload | null => {
  try {
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"], ignoreExpiration: true });
    if (typeof payload === "string" || typeof payload.userId !== "string" || !payload.userId ||
      !Object.values(UserRole).includes(payload.role) || typeof payload.exp !== "number" || payload.exp > Date.now() / 1000) return null;
    return payload as AuthTokenPayload;
  } catch { return null; }
};

type PasswordChangePayload = { sub: string; scope: "staff-password-change"; authVersion: number };
const passwordChangeSecret = () => createHmac("sha256", getJwtSecret())
  .update("speedy-staff-password-change-v1").digest("hex");

export const signPasswordChangeToken = (userId: string, authVersion: number): string =>
  jwt.sign({ sub: userId, scope: "staff-password-change", authVersion }, passwordChangeSecret(),
    { algorithm: "HS256", expiresIn: "10m" });

export const verifyPasswordChangeToken = (token: string): PasswordChangePayload => {
  const payload = jwt.verify(token, passwordChangeSecret(), { algorithms: ["HS256"] }) as PasswordChangePayload;
  if (payload.scope !== "staff-password-change" || !payload.sub || !Number.isInteger(payload.authVersion)) {
    throw new Error("Invalid password change token");
  }
  return payload;
};

export const signCustomerLoyaltyToken = (customerId: string): string => {
  return jwt.sign(
    { sub: customerId, scope: "customer-loyalty" },
    getCustomerLoyaltyJwtSecret(),
    {
      algorithm: "HS256",
      expiresIn: "365d"
    }
  );
};

export const verifyCustomerLoyaltyToken = (
  token: string
): CustomerLoyaltyTokenPayload => {
  const payload = jwt.verify(token, getCustomerLoyaltyJwtSecret(), {
    algorithms: ["HS256"]
  }) as CustomerLoyaltyTokenPayload;

  if (payload.scope !== "customer-loyalty" || !payload.sub) {
    throw new Error("Invalid customer loyalty token");
  }

  return payload;
};
