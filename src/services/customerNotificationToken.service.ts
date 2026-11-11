import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

export const notificationMutationSchema = z.object({
  expectedRevision: z.number().int().min(0).max(2147483646),
  operationId: z.string().uuid(),
  fcmToken: z.string().min(1).max(4096).regex(/^[^\s\x00-\x1f\x7f]+$/).nullable()
}).strict();
export type NotificationMutation = z.infer<typeof notificationMutationSchema>;
export class CustomerNotificationError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
const rejected = () => new CustomerNotificationError(401, "CUSTOMER_ORDER_ACCESS_REJECTED");
const select = {
  id: true, trackingTokenHash: true, trackingTokenExpiresAt: true, privacyErasedAt: true,
  fcmToken: true, fcmTokenRevision: true, fcmTokenMutationId: true, orderStatus: true
} satisfies Prisma.OrderSelect;
type Order = Prisma.OrderGetPayload<{ select: typeof select }>;
const snapshot = (order: Order) => ({ revision: order.fcmTokenRevision, registered: order.fcmToken !== null });

/** An existing opaque order credential authorizes only that order, never a customer lookup. */
export class CustomerNotificationTokens {
  constructor(private db: PrismaClient) {}

  private async authorized(tx: Pick<Prisma.TransactionClient, "order">, id: string, token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw rejected();
    const order = await tx.order.findUnique({ where: { id }, select });
    if (!order || order.privacyErasedAt || !order.trackingTokenHash ||
        order.trackingTokenHash !== createHash("sha256").update(token).digest("hex") ||
        !order.trackingTokenExpiresAt || order.trackingTokenExpiresAt.getTime() <= Date.now()) throw rejected();
    return order;
  }

  async read(id: string, token: string) { return snapshot(await this.authorized(this.db, id, token)); }

  async mutate(id: string, token: string, input: NotificationMutation) {
    return this.db.$transaction(async tx => {
      // Same Order row lock used by UPDATE/erasure. Recheck credentials and clock AFTER waiting.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
      const order = await this.authorized(tx, id, token);
      if (order.fcmTokenMutationId === input.operationId) {
        if (order.fcmToken !== input.fcmToken) throw new CustomerNotificationError(409, "NOTIFICATION_OPERATION_CONFLICT");
        return snapshot(order); // Lost-response retry, with no additional write.
      }
      if (order.fcmTokenRevision !== input.expectedRevision) {
        throw new CustomerNotificationError(409, "NOTIFICATION_REVISION_CONFLICT");
      }
      if (input.fcmToken !== null && ["DELIVERED", "CANCELLED"].includes(order.orderStatus)) {
        throw new CustomerNotificationError(409, "NOTIFICATION_ORDER_CLOSED");
      }
      const updated = await tx.order.update({ where: { id }, data: {
        fcmToken: input.fcmToken, fcmTokenRevision: { increment: 1 }, fcmTokenMutationId: input.operationId
      }, select });
      // Explicit removal, even of an empty association, advances the fence against older writes.
      return snapshot(updated);
    });
  }
}
