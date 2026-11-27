import { logDiagnostic, safeDiagnosticErrorCode } from "../utils/operationalDiagnostics";
import type { Message } from "firebase-admin/messaging";
import { prisma } from "../lib/prisma";
import { messaging } from "../config/firebase";
import { customerNotificationReference, customerNotificationEventId } from "../utils/customerNotificationReference";

export const CUSTOMER_NOTIFICATION_TTL_MS = 15 * 60_000;
export type CustomerNotificationType = "ORDER_OUT_FOR_DELIVERY" | "LOYALTY_REWARD_EARNED" | "LOYALTY_REWARD_APPLIED" | "LOYALTY_PROGRESS_UPDATE";
type Snapshot = {
  orderNumber?: number; id: string; fcmToken: string | null; privacyErasedAt: Date | null; orderStatus: string;
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
  const eventId = customerNotificationEventId(order.id, type, occurredAt);
  return {
    token: order.fcmToken,
    notification: { title: delivery ? "Speedy Sweeties" : "Speedy Sweeties Rewards",
      body: delivery ? "Open the app to check your order update." : "Open the app to check your rewards." },
    data: { type, orderReference: customerNotificationReference(order.id), eventId, notificationSchema: "1",
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
    let order: Snapshot | null = null;
    const log = (outcome: string, extra: Record<string, unknown> = {}) => logDiagnostic({
      event: "CUSTOMER_ORDER_PUSH", outcome, orderNumber: order?.orderNumber, notificationType: type, ...extra
    });
    try {
      // No captured token or deferred retry: consult current deletion/removal/rotation state before sending.
      order = await deps.findOrder(orderId);
      const now = (deps.now ?? Date.now)();
      const message = order && customerNotificationMessage(order, type, now);
      if (!message) {
        const occurredAt = type === "ORDER_OUT_FOR_DELIVERY" ? order?.outForDeliveryAt
          : type === "LOYALTY_REWARD_APPLIED" ? order?.createdAt : order?.deliveredAt;
        const reason = !order ? "ORDER_NOT_FOUND" : order.privacyErasedAt ? "PRIVACY_ERASED"
          : !order.fcmToken ? "NO_TOKEN" : order.orderStatus === "CANCELLED" ? "ORDER_CANCELLED"
          : type === "ORDER_OUT_FOR_DELIVERY" && order.orderStatus !== "OUT_FOR_DELIVERY" ? "STATUS_NOT_ELIGIBLE"
          : !(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > now
            ? "EVENT_TIME_INVALID" : "EVENT_EXPIRED";
        log("skipped", { reason });
        return;
      }
      try { await deps.send(message); log("provider_accepted"); }
      catch (error) {
        const code = safeDiagnosticErrorCode(error);
        log("failed", { code });
        if (code === "messaging/invalid-registration-token" || code === "messaging/registration-token-not-registered") {
          try {
            await deps.clearInvalidToken(order!.id, order!.fcmToken!);
            log("invalid_token_cleanup_completed");
          } catch (cleanupError) { log("token_cleanup_failed", { code: safeDiagnosticErrorCode(cleanupError) }); }
        }
      }
    } catch (error) { log("failed", { reason: "PREPARATION_FAILED", code: safeDiagnosticErrorCode(error) }); }
  };
}

export const sendCustomerOrderNotification = createCustomerOrderNotifier({
  findOrder: id => prisma.order.findUnique({ where: { id }, select: {
    id: true, orderNumber: true, fcmToken: true, privacyErasedAt: true, orderStatus: true,
    createdAt: true, outForDeliveryAt: true, deliveredAt: true
  } }),
  send: message => messaging.send(message),
  clearInvalidToken: (id, token) => prisma.order.updateMany({
    where: { id, fcmToken: token, privacyErasedAt: null },
    data: { fcmToken: null, fcmTokenRevision: { increment: 1 }, fcmTokenMutationId: null }
  })
});
