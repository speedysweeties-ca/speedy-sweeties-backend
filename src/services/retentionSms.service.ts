import { createHmac, timingSafeEqual } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";

const DAY = 86400000;
export const normalizeRetentionPhone = (value: string): string | null => {
  const digits = value.replace(/\D/g, "");
  return /^\d{10}$/.test(digits) ? `+1${digits}` : /^1\d{10}$/.test(digits) ? `+${digits}` : null;
};
export type SmsConfig = {
  mode: "DRY_RUN" | "TEST" | "LIVE"; account: string; token: string; service: string;
  webhookBase: string; suppressionKey: string; startAt: Date; limit: number;
  allowlist: string[]; body: string;
};
export function retentionSmsConfig(e: NodeJS.ProcessEnv = process.env): SmsConfig | null {
  const mode = e.RETENTION_SMS_MODE || "DRY_RUN";
  if (mode === "DRY_RUN") return null;
  if (!["TEST", "LIVE"].includes(mode) || e.RETENTION_SMS_ENABLED !== "true") throw Error("Retention SMS sending is disabled");
  const account = e.RETENTION_TWILIO_ACCOUNT_SID || "";
  const token = e.RETENTION_TWILIO_AUTH_TOKEN || "";
  const service = e.RETENTION_TWILIO_MESSAGING_SERVICE_SID || "";
  const webhookBase = e.RETENTION_SMS_WEBHOOK_BASE || "";
  const suppressionKey = e.RETENTION_SMS_SUPPRESSION_KEY || "";
  const startAt = new Date(e.RETENTION_SMS_START_AT || "");
  const limit = Number(e.RETENTION_SMS_MAX_PER_RUN || "10");
  const allowlist = (e.RETENTION_SMS_TEST_NUMBERS || "").split(",").filter(Boolean);
  const body = e.RETENTION_SMS_APPROVED_BODY || "";
  if (!/^AC[0-9a-f]{32}$/i.test(account) || !/^MG[0-9a-f]{32}$/i.test(service) || !token || suppressionKey.length < 32 ||
      !/^https:\/\/[^?#]+\/api\/v1\/retention-sms$/.test(webhookBase) || !Number.isFinite(startAt.getTime()) ||
      !Number.isInteger(limit) || limit < 1 || limit > 100 || !body.includes("Speedy Sweeties") || !body.includes("Reply STOP") || body.length > 480 ||
      (mode === "TEST" && (!allowlist.length || allowlist.some(p => !/^\+1\d{10}$/.test(p))))) {
    throw Error("Retention SMS configuration is incomplete or invalid");
  }
  return { mode: mode as "TEST" | "LIVE", account, token, service, webhookBase, suppressionKey, startAt, limit, allowlist, body };
}
export const recipientKey = (phone: string, key: string) => "retention-sms:" + createHmac("sha256", key).update(phone).digest("hex");
export function validTwilioSignature(token: string, url: string, params: Record<string, string>, signature: string): boolean {
  const expected = createHmac("sha1", token).update(url + Object.keys(params).sort().map(k => k + params[k]).join("")).digest("base64");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function inRetentionWindow(now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }).format(now));
  return hour >= 10 && hour < 20;
}
export function eligibleRetentionCustomer(customer: { phone: string; smsMarketingOptOut: boolean; smsExpressConsentAt: Date | null; orders: { createdAt: Date; deliveredAt: Date | null }[] }, anchor: Date, phone: string, now: Date): boolean {
  const last = Math.max(...customer.orders.map(o => (o.deliveredAt || o.createdAt).getTime()));
  return !customer.smsMarketingOptOut && normalizeRetentionPhone(customer.phone) === phone && last === anchor.getTime() &&
    last + 90 * DAY <= now.getTime() && (Boolean(customer.smsExpressConsentAt) || last + 730 * DAY >= now.getTime());
}
type RecipientState = { optedOut: boolean; lastAttemptAt?: string };
function parseState(value: string): RecipientState {
  const state = JSON.parse(value);
  if (typeof state.optedOut !== "boolean" || (state.lastAttemptAt !== undefined && !Number.isFinite(Date.parse(state.lastAttemptAt)))) throw Error("Invalid SMS suppression state");
  return state;
}
async function lockedRecipient(tx: Prisma.TransactionClient, key: string): Promise<RecipientState> {
  await tx.systemSetting.upsert({ where: { key }, create: { key, value: '{"optedOut":false}' }, update: {} });
  await tx.$queryRaw`SELECT "key" FROM "SystemSetting" WHERE "key" = ${key} FOR UPDATE`;
  const row = await tx.systemSetting.findUniqueOrThrow({ where: { key } });
  return parseState(row.value);
}

export async function sendRetentionMessages(db: PrismaClient, config: SmsConfig, transport: typeof fetch = fetch, now = new Date()) {
  if (config.mode === "DRY_RUN" || !inRetentionWindow(now)) return { attempted: 0, accepted: 0 };
  const messages = await db.retentionMessage.findMany({ where: { status: "DRY_RUN", attemptedAt: null, eligibleAt: { gte: config.startAt, lte: now }, ...(config.mode === "TEST" ? { phone: { in: config.allowlist } } : {}) }, orderBy: [{ eligibleAt: "asc" }, { id: "asc" }], take: config.limit });
  let attempted = 0, accepted = 0;
  for (const message of messages) {
    const phone = normalizeRetentionPhone(message.phone);
    if (!phone) continue;
    const key = recipientKey(phone, config.suppressionKey);
    const claimed = await db.$transaction(async tx => {
      const state = await lockedRecipient(tx, key);
      const skip = async (reason: string) => {
        await tx.retentionMessage.updateMany({ where: { id: message.id, status: "DRY_RUN", attemptedAt: null }, data: { status: "FAILED", providerStatus: "suppressed", errorMessage: reason } });
        return false;
      };
      if (state.optedOut) return skip("OPTED_OUT");
      if (state.lastAttemptAt && Date.parse(state.lastAttemptAt) + 90 * DAY > now.getTime()) return skip("PHONE_ALREADY_ATTEMPTED");
      const customer = await tx.customer.findUnique({ where: { id: message.customerId }, include: { orders: { where: { orderStatus: "DELIVERED" }, select: { deliveredAt: true, createdAt: true } } } });
      // Any profile sharing this number can suppress it; historical duplicate identities do not authorize extra SMS.
      const digits = phone.slice(1);
      const optedOut = await tx.customer.count({ where: { smsMarketingOptOut: true, normalizedPhone: { in: [digits, digits.slice(1)] } } });
      const privacyPending = await tx.privacyDeletionRequest.count({ where: { subjectId: message.customerId, status: { notIn: ["CANCELLED", "COMPLETED"] } } });
      const recentSharedProfile = await tx.customer.count({ where: { normalizedPhone: { in: [digits, digits.slice(1)] }, orders: { some: { orderStatus: "DELIVERED", OR: [{ deliveredAt: { gt: message.inactivityAnchorAt } }, { deliveredAt: null, createdAt: { gt: message.inactivityAnchorAt } }] } } } });
      if (!customer || optedOut || privacyPending || recentSharedProfile || !eligibleRetentionCustomer(customer, message.inactivityAnchorAt, phone, now)) return skip("NO_LONGER_ELIGIBLE");
      const claim = await tx.retentionMessage.updateMany({ where: { id: message.id, status: "DRY_RUN", attemptedAt: null }, data: { status: "FAILED", attemptedAt: now, provider: "TWILIO", providerStatus: "sending", errorMessage: "SEND_IN_PROGRESS", messageBody: config.body } });
      if (claim.count !== 1) return false;
      await tx.systemSetting.update({ where: { key }, data: { value: JSON.stringify({ ...state, lastAttemptAt: now.toISOString() }) } });
      return true;
    });
    if (!claimed) continue;
    attempted++;
    // The durable claim is never automatically retried, even if a process dies after provider acceptance.
    const state = parseState((await db.systemSetting.findUniqueOrThrow({ where: { key } })).value);
    if (state.optedOut) {
      await db.retentionMessage.update({ where: { id: message.id }, data: { providerStatus: "suppressed", errorMessage: "OPTED_OUT_BEFORE_SEND" } });
      continue;
    }
    let outcome: { sid?: string; status: string; error: string | null } = { status: "unknown", error: "SEND_OUTCOME_UNKNOWN" };
    try {
      const response = await transport(`https://api.twilio.com/2010-04-01/Accounts/${config.account}/Messages.json`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Basic ${Buffer.from(`${config.account}:${config.token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: phone, MessagingServiceSid: config.service, Body: config.body, StatusCallback: `${config.webhookBase}/status/${message.id}` }).toString()
      });
      const data = await response.json() as { sid?: string; status?: string; code?: number };
      if (response.ok && /^SM[0-9a-f]{32}$/i.test(data.sid || "") && ["accepted", "queued", "sending", "sent"].includes(data.status || "")) {
        outcome = { sid: data.sid, status: data.status!, error: null }; accepted++;
      } else if (response.status >= 400 && response.status < 500) {
        outcome = { status: "rejected", error: `TWILIO_REJECTED_${response.status}_${Number.isInteger(data.code) ? data.code : "UNKNOWN"}` };
        if (data.code === 21610) await suppressRetentionPhone(db, phone, config.suppressionKey, now);
      }
    } catch { /* No provider body, phone, credential or raw error goes to logs. No automatic retry. */ }
    // A signed callback can arrive first. Never downgrade that newer evidence.
    await db.retentionMessage.updateMany({ where: { id: message.id, providerStatus: "sending", providerMessageId: null }, data: { status: outcome.sid ? "SENT" : "FAILED", providerMessageId: outcome.sid, providerStatus: outcome.status, sentAt: outcome.sid ? now : null, errorMessage: outcome.error } });
  }
  return { attempted, accepted };
}

export async function suppressRetentionPhone(db: PrismaClient, phone: string, keySecret: string, now = new Date()) {
  const key = recipientKey(phone, keySecret);
  await db.$transaction(async tx => {
    const state = await lockedRecipient(tx, key);
    await tx.systemSetting.update({ where: { key }, data: { value: JSON.stringify({ ...state, optedOut: true }) } });
    await tx.customer.updateMany({ where: { normalizedPhone: { in: [phone.slice(1), phone.slice(2)] } }, data: { smsMarketingOptOut: true, smsMarketingOptOutAt: now } });
  });
}

export const deliveryRank: Record<string, number> = { accepted: 1, queued: 2, sending: 3, sent: 4, delivered: 5, undelivered: 5, failed: 5, canceled: 5 };
export async function recordRetentionDelivery(db: PrismaClient, id: string, params: Record<string, string>, now = new Date()) {
  const status = params.MessageStatus;
  if (!deliveryRank[status] || !/^SM[0-9a-f]{32}$/i.test(params.MessageSid || "")) return;
  const record = await db.retentionMessage.findUnique({ where: { id } });
  if (!record || !record.attemptedAt || record.provider !== "TWILIO" || (record.providerMessageId && record.providerMessageId !== params.MessageSid)) return;
  if ((record.providerMessageId && deliveryRank[record.providerStatus || ""] >= deliveryRank[status]) || ["suppressed", "rejected"].includes(record.providerStatus || "")) return;
  const failed = ["undelivered", "failed", "canceled"].includes(status);
  await db.retentionMessage.updateMany({ where: { id, providerStatus: record.providerStatus, providerMessageId: record.providerMessageId }, data: { providerMessageId: params.MessageSid, providerStatus: status, status: failed ? "FAILED" : "SENT", sentAt: record.sentAt || now, errorMessage: failed ? `TWILIO_DELIVERY_${status}_${/^\d+$/.test(params.ErrorCode || "") ? params.ErrorCode : "UNKNOWN"}` : null } });
}
