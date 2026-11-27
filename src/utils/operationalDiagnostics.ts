import { AsyncLocalStorage } from "node:async_hooks";

// Only this small, explicit schema can reach operational logs. Never spread
// requests, database records, provider exceptions or arbitrary caller metadata.
type Context = { requestId: string; orderNumber?: number };
const context = new AsyncLocalStorage<Context>();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function withDiagnosticContext<T>(requestId: string, work: () => T): T {
  return context.run({ requestId: uuid.test(requestId) ? requestId : "unavailable" }, work);
}
export function setDiagnosticOrder(orderNumber: number | undefined): void {
  const current = context.getStore();
  if (current && Number.isSafeInteger(orderNumber) && orderNumber > 0) current.orderNumber = orderNumber;
}
export function diagnosticContext(): Readonly<Context> | undefined { return context.getStore(); }

const events = new Set([
  "ORDER_CREATE", "AUTO_DISPATCH", "DRIVER_ACTION", "RECEIPT_SAVE", "MANUAL_ASSIGNMENT",
  "DRIVER_ASSIGNMENT_PUSH", "CUSTOMER_ORDER_PUSH", "HTTP_REQUEST_FAILED", "HTTP_SERVER_ERROR"
]);
const outcomes = new Set([
  "started", "committed", "replayed", "rejected", "failed", "skipped", "assigned", "held", "retrying",
  "provider_accepted", "invalid_token_cleanup_completed", "token_cleanup_failed",
  "retry_outside_window", "retry_no_longer_needed", "retry_validation_failed", "retry_scheduled"
]);
const reasons = new Set([
  "DISPATCHED", "AUTO_DISPATCH_DISABLED", "ORDER_NOT_ELIGIBLE", "NO_ROUTEABLE_DRIVERS",
  "ROUTING_UNAVAILABLE", "ORDER_CHANGED", "DRIVER_LOCATION_CHANGED", "ALLOCATION_UNAVAILABLE",
  "ADDRESS_NOT_VERIFIED", "NO_FRESH_GPS", "NO_AVAILABLE_ROUTE", "ROUTING_PROVIDER_FAILED",
  "ALLOCATION_TRANSACTION_FAILED", "NO_ELIGIBLE_CANDIDATE", "DRIVER_UNAVAILABLE",
  "PRIORITY_CAP_REACHED", "LOCATION_RETRY_LIMIT", "SYNTHETIC_ORDER", "NO_TOKEN", "DRIVER_OFFLINE",
  "APP_FOREGROUND", "NOTIFICATION_INPUT_INCOMPLETE", "ORDER_NOT_FOUND", "PRIVACY_ERASED",
  "ORDER_CANCELLED", "STATUS_NOT_ELIGIBLE", "EVENT_TIME_INVALID", "EVENT_EXPIRED",
  "PREPARATION_FAILED", "UNAUTHORIZED", "FORBIDDEN", "INVALID_ACTION", "RECEIPT_REQUIRED",
  "INVALID_ORDER_TRANSITION", "BUSINESS_CLOSED", "ALREADY_ASSIGNED", "UNASSIGNED"
]);
const actions = new Set(["ACCEPTED", "OUT_FOR_DELIVERY", "DELIVERED"]);
const notificationTypes = new Set(["ORDER_OUT_FOR_DELIVERY", "LOYALTY_REWARD_EARNED", "LOYALTY_REWARD_APPLIED", "LOYALTY_PROGRESS_UPDATE"]);
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);

// Only documented codes may reach logs. Never log an SDK message, token,
// notification body, customer address or Firebase credential.
const knownCodes = new Set([
  "messaging/invalid-registration-token", "messaging/registration-token-not-registered",
  "messaging/invalid-argument", "messaging/invalid-recipient", "messaging/invalid-payload",
  "messaging/invalid-data-payload-key", "messaging/payload-size-limit-exceeded",
  "messaging/invalid-options", "messaging/invalid-package-name",
  "messaging/message-rate-exceeded", "messaging/device-message-rate-exceeded",
  "messaging/topics-message-rate-exceeded", "messaging/quota-exceeded",
  "messaging/invalid-apns-credentials", "messaging/third-party-auth-error",
  "messaging/mismatched-credential", "messaging/authentication-error",
  "messaging/server-unavailable", "messaging/internal-error", "messaging/unknown-error",
  "app/network-error", "app/network-timeout", "app/invalid-credential"
]);

export function safeMessagingErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unclassified";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && knownCodes.has(code) ? code : "unclassified";
}

export function safeDiagnosticErrorCode(error: unknown): string {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : safeMessagingErrorCode(error);
}

export function diagnosticRecord(input: Record<string, unknown>): Record<string, string | number> {
  const current = context.getStore();
  const record: Record<string, string | number> = {
    schema: 1, timestamp: new Date().toISOString(), service: "speedy-api",
    event: events.has(String(input.event)) ? String(input.event) : "UNKNOWN",
    outcome: outcomes.has(String(input.outcome)) ? String(input.outcome) : "unknown"
  };
  const release = process.env.RENDER_GIT_COMMIT;
  if (release && /^[a-f0-9]{40}$/.test(release)) record.release = release;
  const requestId = input.requestId ?? current?.requestId;
  if (typeof requestId === "string" && uuid.test(requestId)) record.requestId = requestId;
  if (typeof input.correlationId === "string" && uuid.test(input.correlationId)) record.correlationId = input.correlationId;
  const orderNumber = input.orderNumber ?? current?.orderNumber;
  if (Number.isSafeInteger(orderNumber) && Number(orderNumber) > 0) record.orderNumber = Number(orderNumber);
  for (const [key, allowed] of [["reason", reasons], ["detail", reasons], ["action", actions], ["notificationType", notificationTypes], ["method", methods]] as const) {
    if (allowed.has(String(input[key]))) record[key] = String(input[key]);
  }
  if (input.code !== undefined) record.code = safeDiagnosticErrorCode({ code: input.code });
  for (const key of ["attempt", "delayMs", "durationMs", "status", "eligibleDrivers", "priorityDriverActiveOrders"] as const) {
    if (Number.isSafeInteger(input[key]) && Number(input[key]) >= 0) record[key] = Number(input[key]);
  }
  // Route templates are supplied only by safeRouteTemplate, never req.url/path.
  if (typeof input.route === "string" && input.route.length <= 250 && /^(unmatched|\/[a-zA-Z0-9_/:.*{}-]*)$/.test(input.route)) record.route = input.route;
  return record;
}

export function writeDiagnostic(record: Record<string, string | number>): void {
  // Logging must never turn an already-committed order into a failed request.
  try {
    const line = JSON.stringify(record);
    if (record.outcome === "failed" || String(record.outcome).endsWith("_failed")) console.error(line);
    else if (["held", "rejected"].includes(String(record.outcome))) console.warn(line);
    else console.log(line);
  } catch { /* best-effort log sink */ }
}
export function logDiagnostic(input: Record<string, unknown>): void {
  writeDiagnostic(diagnosticRecord(input));
}
