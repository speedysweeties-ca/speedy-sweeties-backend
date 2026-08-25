import jwt from "jsonwebtoken";
import { createHmac } from "crypto";
import { UserRole } from "@prisma/client";
import { env } from "../config/env";

export type AuthTokenPayload = {
  userId: string;
  email: string;
  role: UserRole;
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
