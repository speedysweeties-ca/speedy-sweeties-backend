import { diagnosticContext, diagnosticRecord, writeDiagnostic, safeMessagingErrorCode } from "../utils/operationalDiagnostics";
import { randomUUID } from "node:crypto";
import type { Message } from "firebase-admin/messaging";
import { messaging } from "../config/firebase";
import { prisma } from "../lib/prisma";

type AssignmentNotification = {
  orderId: string;
  driverId: string;
  token: string;
  orderNumber: number;
  customerName: string;
  addressLine1: string;
  city?: string | null;
  pickupSummary?: string | null;
};

export { safeMessagingErrorCode } from "../utils/operationalDiagnostics";

const invalidTokenCodes = new Set([
  "messaging/invalid-registration-token", "messaging/registration-token-not-registered"
]);
const retryableCodes = new Set(["messaging/server-unavailable", "messaging/internal-error"]);

function retryAfterMs(error: unknown, now: number): number {
  const headers = (error as { httpResponse?: { headers?: Record<string, unknown> } })?.httpResponse?.headers;
  const value = headers?.["retry-after"] ?? headers?.["Retry-After"];
  if (typeof value !== "string") return 0;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

type Dependencies = {
  send(message: Message): Promise<unknown>;
  clearInvalidToken(driverId: string, token: string): Promise<void>;
  stillNeedsNotification(input: AssignmentNotification): Promise<boolean>;
  log(event: Record<string, string | number>): void;
  schedule(callback: () => void, delayMs: number): () => void;
  now?: () => number;
  random?: () => number;
};

export function createDriverAssignmentNotifier(deps: Dependencies) {
  const pending = new Map<string, () => void>();
  let stopped = false;
  const now = deps.now ?? Date.now;

  function buildMessage(input: AssignmentNotification): Message {
    const address = [input.addressLine1, input.city].filter(Boolean).join(", ");
    const body = input.pickupSummary
      ? `Order #${input.orderNumber} assigned. Pickup: ${input.pickupSummary}. ${input.customerName} - ${address}`
      : `Order #${input.orderNumber} assigned to you. ${input.customerName} - ${address}`;
    return {
      token: input.token,
      notification: { title: "New Speedy Sweeties Order", body },
      data: { type: "DRIVER_ORDER_ASSIGNED", orderNumber: String(input.orderNumber) },
      android: {
        priority: "high", ttl: 120_000,
        notification: { channelId: "speedy_sweeties_driver_orders", sound: "default", tag: input.orderId }
      },
      apns: {
        headers: {
          "apns-priority": "10", "apns-push-type": "alert",
          "apns-expiration": String(Math.floor(now() / 1000) + 120),
          "apns-collapse-id": input.orderId
        },
        payload: { aps: { sound: "default" } }
      }
    };
  }

  async function notify(input: AssignmentNotification, correlationId = randomUUID(), attempt = 1, requestId = diagnosticContext()?.requestId): Promise<void> {
    if (stopped) return;
    const key = `${input.orderId}/${input.driverId}`;
    const log = (outcome: string, extra: Record<string, string | number> = {}) =>
      deps.log(diagnosticRecord({ event: "DRIVER_ASSIGNMENT_PUSH", orderNumber: input.orderNumber, requestId, correlationId, attempt, outcome, ...extra }));
    try {
      await deps.send(buildMessage(input));
      log("provider_accepted"); // Provider acceptance is not proof of device delivery.
    } catch (error) {
      const code = safeMessagingErrorCode(error);
      log("failed", { code });
      if (invalidTokenCodes.has(code)) {
        try {
          await deps.clearInvalidToken(input.driverId, input.token);
          log("invalid_token_cleanup_completed");
        } catch {
          log("token_cleanup_failed");
        }
        return;
      }
      // One deferred retry only for explicit FCM server errors, after the SDK's
      // built-in retries. Ambiguous timeouts and unknown errors are not retried:
      // the original send may have succeeded. Rate limits also need separate policy.
      if (attempt !== 1 || !retryableCodes.has(code) || stopped || pending.has(key)) return;
      const delayMs = Math.max(retryAfterMs(error, now()), 60_000 + Math.floor((deps.random ?? Math.random)() * 15_000));
      if (delayMs > 120_000) { log("retry_outside_window"); return; }
      pending.set(key, deps.schedule(() => {
        pending.delete(key);
        void (async () => {
          if (stopped) return;
          try {
            if (!(await deps.stillNeedsNotification(input))) { log("retry_no_longer_needed"); return; }
            await notify(input, correlationId, 2, requestId);
          } catch { log("retry_validation_failed"); }
        })();
      }, delayMs));
      log("retry_scheduled", { delayMs });
    }
  }

  return {
    notify,
    stop() { stopped = true; for (const cancel of pending.values()) cancel(); pending.clear(); }
  };
}

const notifier = createDriverAssignmentNotifier({
  send: message => messaging.send(message),
  clearInvalidToken: async (driverId, token) => {
    // Compare-and-clear: never erase a fresh registration uploaded concurrently.
    await prisma.user.updateMany({ where: { id: driverId, driverFcmToken: token }, data: { driverFcmToken: null } });
  },
  stillNeedsNotification: async input => Boolean(await prisma.order.findFirst({
    where: {
      id: input.orderId, assignedDriverId: input.driverId, orderStatus: "DISPATCHED",
      assignedDriver: {
        isActive: true, isOnline: true, driverFcmToken: input.token,
        OR: [{ driverAppState: null }, { driverAppState: { not: "FOREGROUND" } }]
      }
    }, select: { id: true }
  })),
  log: writeDiagnostic,
  schedule: (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs); timer.unref();
    return () => clearTimeout(timer);
  }
});

export const sendDriverAssignmentNotification = notifier.notify;
export const stopDriverAssignmentNotifications = notifier.stop;
