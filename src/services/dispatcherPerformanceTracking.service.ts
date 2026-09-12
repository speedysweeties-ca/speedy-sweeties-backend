import {
  DispatchEventType,
  DispatchSource,
  Prisma
} from "@prisma/client";
import { prisma } from "../lib/prisma";

const MAX_MANUAL_ENTRY_DURATION_MS = 4 * 60 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 60 * 1000;

export const normalizeManualEntryStartedAt = (
  value: unknown,
  now = new Date()
): Date | null => {
  if (typeof value !== "string" || !value.trim()) return null;

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;

  const elapsedMs = now.getTime() - parsed.getTime();
  if (
    elapsedMs < -MAX_FUTURE_CLOCK_SKEW_MS ||
    elapsedMs > MAX_MANUAL_ENTRY_DURATION_MS
  ) {
    return null;
  }

  return parsed.getTime() > now.getTime() ? now : parsed;
};

export type RecordDispatchEventInput = {
  orderId: string;
  eventType: DispatchEventType;
  dispatchSource: DispatchSource;
  actorUserId?: string | null;
  fromDriverId?: string | null;
  toDriverId?: string | null;
  occurredAt?: Date;
};

/**
 * Audit telemetry must never make an otherwise-successful live dispatch fail.
 * Core first-dispatch attribution remains on Order; this event history adds
 * assignment/reassignment detail for long-term performance review.
 */
export const recordDispatchEventBestEffort = async (
  input: RecordDispatchEventInput
): Promise<void> => {
  const data: Prisma.DispatchEventUncheckedCreateInput = {
    orderId: input.orderId,
    eventType: input.eventType,
    dispatchSource: input.dispatchSource,
    actorUserId: input.actorUserId ?? null,
    fromDriverId: input.fromDriverId ?? null,
    toDriverId: input.toDriverId ?? null,
    occurredAt: input.occurredAt
  };

  try {
    await prisma.dispatchEvent.create({ data });
  } catch (error) {
    console.error(
      "[Dispatch Audit] Event could not be recorded.",
      error instanceof Error ? error.name : typeof error
    );
  }
};
