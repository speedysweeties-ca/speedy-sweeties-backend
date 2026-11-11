import { createHmac } from "node:crypto";
import { env } from "../config/env";

// Public routing hints, NOT capabilities. No endpoint accepts these as credentials or order IDs.
// Keep the legacy UUID tracking capability out of notifications, including for low-entropy historical IDs.
export const customerNotificationReference = (orderId: string): string => "nr1_" + createHmac("sha256", env.JWT_SECRET)
  .update(`customer-notification-reference:v1|${orderId}`).digest("hex");
export const customerNotificationEventId = (orderId: string, type: string, occurredAt: Date): string =>
  createHmac("sha256", env.JWT_SECRET).update(`customer-notification-event:v1|${orderId}|${type}|${occurredAt.toISOString()}`).digest("hex");
