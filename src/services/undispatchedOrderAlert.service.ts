import { OrderStatus } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const RESEND_API_URL = "https://api.resend.com/emails";
const EMAIL_TIMEOUT_MS = 10_000;
const CANDIDATE_LIMIT = 25;

type AlertCandidate = {
  id: string;
  orderNumber: number;
  createdAt: Date;
};

type ClaimedOrder = AlertCandidate & {
  orderStatus: OrderStatus;
  dispatchedAt: Date | null;
};

type FindCandidateOptions = {
  cutoff: Date;
  earliestCreatedAt: Date;
  staleClaimBefore: Date;
  limit: number;
};

export type UndispatchedOrderAlertStore = {
  findCandidates(options: FindCandidateOptions): Promise<AlertCandidate[]>;
  claim(
    orderId: string,
    claimTime: Date,
    staleClaimBefore: Date
  ): Promise<boolean>;
  getClaimedOrder(orderId: string): Promise<ClaimedOrder | null>;
  markSent(orderId: string, claimTime: Date, sentAt: Date): Promise<boolean>;
  release(orderId: string, claimTime: Date): Promise<void>;
};

type AlertEmail = {
  id: string;
};

type SendAlert = (order: AlertCandidate, waitingMinutes: number) => Promise<AlertEmail>;

type ProcessAlertOptions = {
  store: UndispatchedOrderAlertStore;
  sendAlert: SendAlert;
  now?: Date;
  alertAfterMinutes?: number;
  maxAgeHours?: number;
};

type ResendOptions = {
  apiKey: string;
  from: string;
  to: string;
  dispatcherUrl?: string;
  fetchImpl?: typeof fetch;
};

const normalizePositiveNumber = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? value : fallback;

const getErrorMessage = (value: unknown): string => {
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  return "Unknown email provider error";
};

const prismaAlertStore: UndispatchedOrderAlertStore = {
  findCandidates: async ({
    cutoff,
    earliestCreatedAt,
    staleClaimBefore,
    limit
  }) =>
    prisma.order.findMany({
      where: {
        orderStatus: OrderStatus.PLACED,
        dispatchedAt: null,
        createdAt: {
          gte: earliestCreatedAt,
          lte: cutoff
        },
        undispatchedAlertSentAt: null,
        OR: [
          { undispatchedAlertClaimedAt: null },
          { undispatchedAlertClaimedAt: { lte: staleClaimBefore } }
        ]
      },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true
      },
      orderBy: { createdAt: "asc" },
      take: limit
    }),

  claim: async (orderId, claimTime, staleClaimBefore) => {
    const result = await prisma.order.updateMany({
      where: {
        id: orderId,
        orderStatus: OrderStatus.PLACED,
        dispatchedAt: null,
        undispatchedAlertSentAt: null,
        OR: [
          { undispatchedAlertClaimedAt: null },
          { undispatchedAlertClaimedAt: { lte: staleClaimBefore } }
        ]
      },
      data: { undispatchedAlertClaimedAt: claimTime }
    });

    return result.count === 1;
  },

  getClaimedOrder: (orderId) =>
    prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        orderStatus: true,
        dispatchedAt: true
      }
    }),

  markSent: async (orderId, claimTime, sentAt) => {
    const result = await prisma.order.updateMany({
      where: {
        id: orderId,
        undispatchedAlertClaimedAt: claimTime,
        undispatchedAlertSentAt: null
      },
      data: {
        undispatchedAlertClaimedAt: null,
        undispatchedAlertSentAt: sentAt
      }
    });

    return result.count === 1;
  },

  release: async (orderId, claimTime) => {
    await prisma.order.updateMany({
      where: {
        id: orderId,
        undispatchedAlertClaimedAt: claimTime,
        undispatchedAlertSentAt: null
      },
      data: { undispatchedAlertClaimedAt: null }
    });
  }
};

export const sendUndispatchedOrderAlertWithResend = async (
  order: AlertCandidate,
  waitingMinutes: number,
  options: ResendOptions
): Promise<AlertEmail> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const dispatcherUrl =
    options.dispatcherUrl ?? "https://speedy-dispatcher.onrender.com";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);
  timeout.unref();

  try {
    const subject = `Order #${order.orderNumber} is waiting for dispatch`;
    const text = [
      `Order #${order.orderNumber} has been waiting at least ${waitingMinutes} minutes and has not been dispatched.`,
      "",
      `Open Dispatcher: ${dispatcherUrl}`
    ].join("\n");

    const response = await fetchImpl(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `undispatched-order/${order.id}`
      },
      body: JSON.stringify({
        from: options.from,
        to: [options.to],
        subject,
        text
      }),
      signal: controller.signal
    });

    const responseBody = (await response.json().catch(() => ({}))) as unknown;

    if (!response.ok) {
      throw new Error(`Resend rejected the alert: ${getErrorMessage(responseBody)}`);
    }

    const id =
      responseBody &&
      typeof responseBody === "object" &&
      "id" in responseBody &&
      typeof (responseBody as { id?: unknown }).id === "string"
        ? (responseBody as { id: string }).id
        : "accepted";

    return { id };
  } finally {
    clearTimeout(timeout);
  }
};

export const processUndispatchedOrderAlerts = async ({
  store,
  sendAlert,
  now = new Date(),
  alertAfterMinutes = 5,
  maxAgeHours = 24
}: ProcessAlertOptions): Promise<number> => {
  const normalizedAlertMinutes = normalizePositiveNumber(alertAfterMinutes, 5);
  const normalizedMaxAgeHours = normalizePositiveNumber(maxAgeHours, 24);
  const cutoff = new Date(now.getTime() - normalizedAlertMinutes * MINUTE_MS);
  const earliestCreatedAt = new Date(
    now.getTime() - normalizedMaxAgeHours * HOUR_MS
  );
  const staleClaimBefore = new Date(now.getTime() - 10 * MINUTE_MS);
  const candidates = await store.findCandidates({
    cutoff,
    earliestCreatedAt,
    staleClaimBefore,
    limit: CANDIDATE_LIMIT
  });
  let sentCount = 0;

  for (const candidate of candidates) {
    const claimTime = new Date();
    const claimed = await store.claim(candidate.id, claimTime, staleClaimBefore);
    if (!claimed) continue;

    try {
      const currentOrder = await store.getClaimedOrder(candidate.id);

      if (
        !currentOrder ||
        currentOrder.orderStatus !== OrderStatus.PLACED ||
        currentOrder.dispatchedAt !== null
      ) {
        await store.release(candidate.id, claimTime);
        continue;
      }

      const waitingMinutes = Math.max(
        normalizedAlertMinutes,
        Math.floor((now.getTime() - currentOrder.createdAt.getTime()) / MINUTE_MS)
      );

      const providerResult = await sendAlert(currentOrder, waitingMinutes);
      const markedSent = await store.markSent(candidate.id, claimTime, new Date());

      if (markedSent) {
        sentCount += 1;
        console.log(
          `Undispatched order alert sent for order #${currentOrder.orderNumber} (${providerResult.id}).`
        );
      }
    } catch (error) {
      await store.release(candidate.id, claimTime).catch((): void => undefined);
      console.error(
        `Failed to send undispatched alert for order #${candidate.orderNumber}:`,
        error instanceof Error ? error.message : typeof error
      );
    }
  }

  return sentCount;
};

export const startUndispatchedOrderAlertMonitor = (): (() => void) => {
  if (!env.RESEND_API_KEY.trim()) {
    console.warn(
      "Undispatched order alerts are disabled because RESEND_API_KEY is not configured."
    );
    return () => undefined;
  }

  const pollIntervalMs =
    normalizePositiveNumber(env.UNDISPATCHED_ALERT_POLL_SECONDS, 60) * 1000;
  let isRunning = false;

  const runCheck = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      await processUndispatchedOrderAlerts({
        store: prismaAlertStore,
        sendAlert: (order, waitingMinutes) =>
          sendUndispatchedOrderAlertWithResend(order, waitingMinutes, {
            apiKey: env.RESEND_API_KEY,
            from: env.UNDISPATCHED_ALERT_FROM,
            to: env.UNDISPATCHED_ALERT_EMAIL
          }),
        alertAfterMinutes: env.UNDISPATCHED_ALERT_AFTER_MINUTES,
        maxAgeHours: env.UNDISPATCHED_ALERT_MAX_AGE_HOURS
      });
    } catch (error) {
      console.error(
        "Undispatched order alert check failed:",
        error instanceof Error ? error.message : typeof error
      );
    } finally {
      isRunning = false;
    }
  };

  void runCheck();
  const timer = setInterval(() => void runCheck(), pollIntervalMs);
  timer.unref();

  console.log(
    `Undispatched order alert monitor started (${env.UNDISPATCHED_ALERT_AFTER_MINUTES} minute threshold).`
  );

  return () => clearInterval(timer);
};
