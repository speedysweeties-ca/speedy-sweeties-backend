import { createHash } from "node:crypto";
import type { Message } from "firebase-admin/messaging";
import { prisma } from "../lib/prisma";
import { messaging } from "../config/firebase";

export const CUSTOMER_NOTIFICATION_TTL_MS = 15 * 60_000;
export type CustomerNotificationType = "ORDER_OUT_FOR_DELIVERY" | "LOYALTY_REWARD_EARNED" | "LOYALTY_REWARD_APPLIED" | "LOYALTY_PROGRESS_UPDATE";
type Snapshot = {
  id: string; fcmToken: string | null; privacyErasedAt: Date | null; orderStatus: string;
  createdAt: Date; outForDeliveryAt: Date | null; deliveredAt: Date | null;
};
export function customerNotificationMessage(order: Snapshot, type: CustomerNotificationType, now = Date.now()): Message | null {
  if (!order.fcmToken || order.privacyErasedAt || order.orderStatus === "CANCELLED") return null;
  const delivery = type === "ORDER_OUT_FOR_DELIVERY";
  if (delivery && order.orderStatus !== "OUT_FOR_DELIVERY") return null;
  const occurredAt = delivery ? order.outForDeliveryAt : type === "LOYALTY_REWARD_APPLIED" ? order.createdAt : order.deliveredAt;
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) return null;
  const expiresAt = occurredAt.getTime() + CUSTOMER_NOTIFICATION_TTL_MS;
  if (occurredAt.getTime() > now || expiresAt <= now) return null;
  // Identity derives from the committed event, not a provider attempt ID or a fresh retry clock.
  const eventId = createHash("sha256").update(`customer-order:v1|${order.id}|${type}|${occurredAt.toISOString()}`).digest("hex");
  return {
    token: order.fcmToken,
    notification: { title: delivery ? "Speedy Sweeties" : "Speedy Sweeties Rewards",
      body: delivery ? "Open the app to check your order update." : "Open the app to check your rewards." },
    data: { type, orderId: order.id, eventId, notificationSchema: "1",
      occurredAtMillis: String(occurredAt.getTime()), expiresAtMillis: String(expiresAt),
      ...(delivery ? { status: "OUT_FOR_DELIVERY" } : {}) },
    android: { priority: "high", ttl: expiresAt - now,
      collapseKey: eventId, notification: { channelId: "speedy_sweeties_orders", sound: "default", tag: eventId } },
    apns: { headers: { "apns-expiration": String(Math.floor(expiresAt / 1000)), "apns-collapse-id": eventId },
      payload: { aps: { sound: "default" } } }
  };
}

export function createCustomerOrderNotifier(deps: {
  findOrder(id: string): Promise<Snapshot | null>;
  send(message: Message): Promise<unknown>;
  clearInvalidToken(id: string, token: string): Promise<unknown>;
  now?: () => number;
}) {
  return async (orderId: string, type: CustomerNotificationType) => {
    try {
      // No captured token or deferred retry: consult current deletion/removal/rotation state before sending.
      const order = await deps.findOrder(orderId);
      const message = order && customerNotificationMessage(order, type, (deps.now ?? Date.now)());
      if (!message) return;
      try { await deps.send(message); }
      catch (error) {
        const code = (error as { code?: unknown })?.code;
        if (code === "messaging/invalid-registration-token" || code === "messaging/registration-token-not-registered") {
          await deps.clearInvalidToken(order!.id, order!.fcmToken!);
        }
        // No token, payload, provider body, address or SDK exception reaches logs.
        console.error("Customer notification provider did not confirm delivery");
      }
    } catch { console.error("Customer notification could not be prepared"); }
  };
}

export const sendCustomerOrderNotification = createCustomerOrderNotifier({
  findOrder: id => prisma.order.findUnique({ where: { id }, select: {
    id: true, fcmToken: true, privacyErasedAt: true, orderStatus: true,
    createdAt: true, outForDeliveryAt: true, deliveredAt: true
  } }),
  send: message => messaging.send(message),
  clearInvalidToken: (id, token) => prisma.order.updateMany({
    where: { id, fcmToken: token, privacyErasedAt: null },
    data: { fcmToken: null, fcmTokenRevision: { increment: 1 }, fcmTokenMutationId: null }
  })
});
