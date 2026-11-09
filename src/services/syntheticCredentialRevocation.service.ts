import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { CustomerLoyaltyTokenPayload } from "../utils/jwt";
import { ApiError } from "../utils/ApiError";
import { assertSyntheticOwner, lockedPolicy, profileFingerprints, SYNTHETIC_CANCELLATION_REASON } from "./syntheticOrderSafety.service";

// A per-subject tombstone, independent of the policy's expiry/usage lifecycle.
// Never remove it when closing a policy: old signed JWTs can outlive that policy.
export const syntheticCredentialRevocationKey = (customerId: string) => `syntheticCredentialRevocation.v1:${customerId}`;
const recordSchema = z.object({
  version: z.literal(1), event: z.literal("EXPOSED_SYNTHETIC_CREDENTIALS_REVOKED"),
  sourceOrderId: z.string().uuid(), actorId: z.string().min(1).max(128),
  revokedAt: z.string().datetime(), loyaltyIssuedThrough: z.number().int().nonnegative()
}).strict();
const inputSchema = z.object({
  ownerConfirmedSynthetic: z.literal(true), expectedExpiresAt: z.string().datetime(),
  expectedOrdersCreated: z.literal(1), expectedEmailsClaimed: z.literal(2)
}).strict();
const refused = () => new ApiError(409, "Synthetic credential revocation refused; stop and inspect state.");

export async function assertSyntheticLoyaltyCredentialActive(
  db: Pick<Prisma.TransactionClient, "systemSetting">, payload: CustomerLoyaltyTokenPayload
) {
  const row = await db.systemSetting.findUnique({ where: { key: syntheticCredentialRevocationKey(payload.sub) } });
  if (!row) return; // Other customers and existing ordinary credentials are unchanged.
  let value: unknown;
  try { value = JSON.parse(row.value); } catch { throw new ApiError(401, "Invalid customer credential."); }
  const record = recordSchema.safeParse(value);
  if (!record.success || !Number.isSafeInteger(payload.iat) || payload.iat! <= record.data.loyaltyIssuedThrough) {
    throw new ApiError(401, "Invalid customer credential.");
  }
}

export async function revokeExposedSyntheticCredentials(
  db: PrismaClient, actor: { userId?: string; role?: string } | undefined, input: unknown
) {
  assertSyntheticOwner(actor);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, "Invalid synthetic credential revocation scope.");
  return db.$transaction(async tx => {
    // Match privacy bootstrap/order lock order: privacy identity, then policy.
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(2601022)");
    const p = await lockedPolicy(tx), now = new Date();
    if (!p || p.state !== "ACTIVE" || Date.parse(p.expiresAt) <= now.getTime() ||
        p.expiresAt !== parsed.data.expectedExpiresAt || !p.addressCorrectionAudit || !p.customerId ||
        p.maxOrders !== 6 || p.ordersCreated !== parsed.data.expectedOrdersCreated ||
        p.maxEmails !== 3 || p.emailsClaimed !== parsed.data.expectedEmailsClaimed) throw refused();
    const customer = await tx.customer.findUnique({ where: { id: p.customerId } });
    if (!customer || !customer.smsMarketingOptOut || customer.loyaltyCompletedOrders !== 0 ||
        customer.loyaltyRewardsEarned !== 0 || customer.loyaltyRewardsUsed !== 0 ||
        customer.loyaltyRewardBalance !== 0 || customer.loyaltyFreeDelivery) throw refused();
    const fingerprints = profileFingerprints({ customerName: customer.fullName, customerPhone: customer.phone,
      customerEmail: customer.email || "", addressLine1: customer.addressLine1, city: customer.city,
      province: customer.province, unitNumber: customer.unitNumber, buzzCode: customer.buzzCode });
    if (fingerprints.profileHash !== p.profileHash || fingerprints.phoneHash !== p.phoneHash ||
        fingerprints.emailHash !== p.emailHash) throw refused();
    const orders = await tx.order.findMany({ where: { customerId: p.customerId }, take: 2,
      select: { id: true, orderStatus: true, cancellationReason: true, privacyErasedAt: true,
        assignedDriverId: true, dispatchedAt: true, fcmToken: true, trackingTokenHash: true,
        _count: { select: { dispatchEvents: true, pickupStops: true } }, digitalReceipt: { select: { id: true } } } });
    const order = orders[0];
    if (orders.length !== 1 || order.orderStatus !== "CANCELLED" ||
        order.cancellationReason !== SYNTHETIC_CANCELLATION_REASON || order.privacyErasedAt ||
        order.assignedDriverId || order.dispatchedAt || order.fcmToken || order.digitalReceipt ||
        order._count.dispatchEvents || order._count.pickupStops || !order.trackingTokenHash ||
        await tx.order.count({ where: { cancellationReason: SYNTHETIC_CANCELLATION_REASON } }) !== 1 ||
        await tx.privacyDeletionRequest.count({ where: { subjectId: p.customerId } }) !== 0) throw refused();
    const key = syntheticCredentialRevocationKey(p.customerId);
    if (await tx.systemSetting.findUnique({ where: { key } })) throw refused();
    const record = recordSchema.parse({ version: 1, event: "EXPOSED_SYNTHETIC_CREDENTIALS_REVOKED",
      sourceOrderId: order.id, actorId: actor!.userId!, revokedAt: now.toISOString(),
      loyaltyIssuedThrough: Math.floor(now.getTime() / 1000) });
    await tx.systemSetting.create({ data: { key, value: JSON.stringify(record) } });
    await tx.order.update({ where: { id: order.id }, data: { trackingTokenHash: null, trackingTokenExpiresAt: null } });
    // Do not update the policy, Customer, privacy access, challenges or counters.
    return { revoked: true as const, trackingRevoked: true as const, priorLoyaltyRevoked: true as const,
      revokedAt: record.revokedAt, state: p.state, expiresAt: p.expiresAt,
      maxOrders: p.maxOrders, ordersCreated: p.ordersCreated, maxEmails: p.maxEmails, emailsClaimed: p.emailsClaimed };
  }, { maxWait: 2000, timeout: 10000 });
}
