import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { privacyLock, PrivacyError, digest } from "./privacyDeletion.service";

// No feature flag bypass: once an identity has been deleted, old clients cannot
// recreate it merely by submitting the same unverified phone number.
export async function assertPrivacyOrderAllowed(tx: Prisma.TransactionClient, phone: string) {
  await privacyLock(tx);
  const key = process.env.PRIVACY_DIGEST_KEY || env.JWT_SECRET;
  if (await tx.privacyDeletedIdentity.findFirst({ where: { keyFingerprint: { not: digest(key) } }, select: { phoneHash: true } }))
    throw new PrivacyError(503, "PRIVACY_KEY_MIGRATION_REQUIRED");
  const phoneHash = createHmac("sha256", key).update(`privacy-v1:phone:${phone.replace(/\D/g, "")}`).digest("hex");
  if (await tx.privacyDeletedIdentity.findUnique({ where: { phoneHash } }))
    throw new PrivacyError(409, "IDENTITY_REVERIFICATION_REQUIRED");
}
