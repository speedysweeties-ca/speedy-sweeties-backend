import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { BND_POLL_MS, BndPendingOrder, BndStatus } from "../integrations/bnd/monitor";
import { getBndMonitorStatus } from "./bndOrderMonitor.service";

export const BND_EMAIL_RECIPIENT = "rstubbings@hotmail.com";
export const BND_EMAIL_SETTING_KEY = "bndEmailAlertsEnabled";
const CLAIM_MS = 2 * 60_000;
// Resend retains idempotency keys for 24 hours. Stop ambiguous retries before
// expiry so an old unconfirmed send cannot turn into a duplicate email.
const RETRY_WINDOW_MS = 23 * 60 * 60_000;

export const getBndEmailEnabled = async (): Promise<boolean> => {
  const setting = await prisma.systemSetting.findUnique({ where: { key: BND_EMAIL_SETTING_KEY } });
  return setting?.value === "true"; // Opt in from the admin control.
};

export const getBndEmailSettings = async () => ({
  enabled: await getBndEmailEnabled(),
  recipient: BND_EMAIL_RECIPIENT,
  configured: Boolean(env.RESEND_API_KEY.trim() && env.UNDISPATCHED_ALERT_FROM.trim()),
});

export const saveBndEmailEnabled = async (enabled: boolean) => {
  await prisma.systemSetting.upsert({
    where: { key: BND_EMAIL_SETTING_KEY },
    create: { key: BND_EMAIL_SETTING_KEY, value: String(enabled) },
    update: { value: String(enabled) },
  });
  return getBndEmailSettings();
};

type Claim = { order: BndPendingOrder; claimedAt: Date };
export type BndEmailStore = {
  enabled(): Promise<boolean>;
  claim(order: BndPendingOrder, now: Date): Promise<Claim | null>;
  markSent(claim: Claim, now: Date): Promise<void>;
};

export const prismaBndEmailStore: BndEmailStore = {
  enabled: getBndEmailEnabled,
  async claim(order, now) {
    // Durable receipts are separate from Speedy orders and customer records.
    const receipt = await prisma.bndEmailAlert.upsert({
      where: { orderId: order.id }, update: {},
      create: { orderId: order.id, orderNumber: order.number, createdAt: now },
    });
    const result = await prisma.bndEmailAlert.updateMany({
      where: {
        orderId: order.id, sentAt: null,
        createdAt: { gte: new Date(now.getTime() - RETRY_WINDOW_MS) },
        OR: [{ claimedAt: null }, { claimedAt: { lte: new Date(now.getTime() - CLAIM_MS) } }],
      },
      data: { claimedAt: now },
    });
    return result.count === 1
      ? { order: { id: receipt.orderId, number: receipt.orderNumber }, claimedAt: now } : null;
  },
  async markSent(claim, now) {
    await prisma.bndEmailAlert.updateMany({
      where: { orderId: claim.order.id, claimedAt: claim.claimedAt, sentAt: null },
      data: { sentAt: now, claimedAt: null },
    });
  },
};

export async function sendBndEmailWithResend(order: BndPendingOrder, options: {
  apiKey: string; from: string; fetchImpl?: typeof fetch;
}): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  timeout.unref();
  try {
    const response = await (options.fetchImpl ?? fetch)("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: {
        Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json",
        "Idempotency-Key": `bnd-waiting-order/${order.id}`,
      },
      body: JSON.stringify({
        from: options.from, to: [BND_EMAIL_RECIPIENT],
        subject: `New B&D order to collect — #${order.number}`,
        text: [
          `B&D order #${order.number} is waiting to be collected.`,
          "Please check B&D using your usual process.", "",
          "Open Dispatcher: https://speedy-dispatcher.onrender.com", "",
          "Manage these emails with the admin-only B&D Emails switch in Dispatcher.",
        ].join("\n"),
      }),
    });
    // Never include provider responses, credentials or customer data in logs.
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`B&D email provider returned HTTP ${response.status}`);
    }
    const body = await response.json();
    if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !body.id) {
      throw new Error("B&D email acceptance was not confirmed");
    }
  } finally { clearTimeout(timeout); }
}

export function createBndEmailProcessor(options: {
  store: BndEmailStore;
  getStatus: () => BndStatus;
  send: (order: BndPendingOrder) => Promise<void>;
  now?: () => number;
  onError?: () => void;
}) {
  const now = options.now ?? Date.now;
  let running = false;
  let stopped = false;
  const freshOrders = () => {
    const status = options.getStatus();
    return status.state === "connected" && status.lastSuccessAt &&
      now() - Date.parse(status.lastSuccessAt) <= 2 * BND_POLL_MS
      ? status.pendingOrders : [];
  };
  async function check() {
    if (running || stopped) return;
    running = true;
    try {
      if (!(await options.store.enabled())) return;
      let attempted = 0;
      for (const order of freshOrders()) {
        if (stopped || !(await options.store.enabled())) break;
        if (!freshOrders().some(current => current.id === order.id)) continue;
        const claim = await options.store.claim(order, new Date(now()));
        if (!claim) continue;
        if (stopped || !(await options.store.enabled())) break;
        if (!freshOrders().some(current => current.id === order.id)) continue;
        try {
          await options.send(claim.order);
          await options.store.markSent(claim, new Date(now()));
        } catch {
          // Keep the claim for a two-minute retry delay. The same durable ID
          // protects retries after a timeout, crash, restart or overlapping deploy.
          options.onError?.();
        }
        if (++attempted >= 10) break;
      }
    } catch { options.onError?.(); }
    finally { running = false; }
  }
  return { check, stop: () => { stopped = true; } };
}

export function startBndEmailAlertMonitor(): () => void {
  if (!env.RESEND_API_KEY.trim() || !env.UNDISPATCHED_ALERT_FROM.trim()) return () => {};
  const processor = createBndEmailProcessor({
    store: prismaBndEmailStore, getStatus: getBndMonitorStatus,
    send: order => sendBndEmailWithResend(order, {
      apiKey: env.RESEND_API_KEY, from: env.UNDISPATCHED_ALERT_FROM,
    }),
    onError: () => console.error("B&D email alert failed; delivery is unconfirmed. Check email service and database health."),
  });
  // Read the existing cache; email outages never slow or break B&D monitoring.
  const timer = setInterval(() => void processor.check(), 10_000);
  timer.unref();
  void processor.check();
  return () => { clearInterval(timer); processor.stop(); };
}
