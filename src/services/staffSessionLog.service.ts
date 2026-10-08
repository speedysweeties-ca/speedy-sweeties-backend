import { createHmac, randomUUID } from "node:crypto";
import { Request } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";

export const sessionReasons = {
  MANUAL_LOGOUT: "Logout button pressed",
  INACTIVITY_TIMEOUT: "App inactivity timeout",
  CLIENT_SESSION_REJECTED: "App reported a rejected session",
  DRIVER_OFFLINE_UNSPECIFIED: "Driver app went offline — reason not reported",
  TOKEN_EXPIRED: "Sign-in token expired",
  ACCOUNT_NOT_FOUND: "Staff account no longer exists",
  ACCOUNT_DEACTIVATED: "Staff account deactivated",
  PASSWORD_CHANGE_REQUIRED: "Password change required",
  SESSION_REVOKED: "Session revoked by an account or access change",
  FORCE_LOGOUT: "Force logout requested",
  DRIVER_HIDDEN: "Driver hidden from dispatch",
  PASSWORD_RESET: "Administrator reset the password",
  PASSWORD_CHANGED: "Staff member changed their password",
  ACCOUNT_DETAILS_CHANGED: "Staff email or role changed",
  ACCOUNT_REACTIVATED: "Account reactivated; old sessions revoked",
  DATABASE_UNAVAILABLE: "Database connection interrupted — sign-in check unavailable",
} as const;
export type SessionReason = keyof typeof sessionReasons;
export type SessionOutcome = "CLIENT_REPORTED" | "ACCESS_REVOKED" | "SESSION_REJECTED" | "CHECK_INTERRUPTED" | "OFFLINE_REPORTED";
export const sessionOutcomes: Record<SessionOutcome, string> = {
  CLIENT_REPORTED: "Logout reported by app",
  ACCESS_REVOKED: "Access revoked by server",
  SESSION_REJECTED: "Server rejected session",
  CHECK_INTERRUPTED: "Connection issue; logout not confirmed",
  OFFLINE_REPORTED: "Offline reported; logout not confirmed",
};
type Subject = { id?: string; userId?: string; role: string; firstName?: string | null; lastName?: string | null };
type Entry = {
  id: string; eventKey: string; occurredAt: Date; userId: string; staffName: string | null;
  role: UserRole; client: string; reason: SessionReason; outcome: SessionOutcome;
  actorId: string | null; actorName: string | null;
};
const queue = new Map<string, Entry>();
const recent = new Map<string, number>();
let flushing: Promise<void> | undefined;
let timer: NodeJS.Timeout | undefined;
const MAX_BUFFER = 500;

const nameOf = (user?: Subject) => [user?.firstName, user?.lastName].filter(Boolean).join(" ").slice(0, 200) || null;
export function sessionClient(req: Request): string {
  const ua = String(req.headers["user-agent"] || "");
  if (/SpeedySweetiesDriveriOS/i.test(ua)) return "iPhone driver app";
  if (/okhttp/i.test(ua)) return "Android app";
  if (/Mozilla/i.test(ua)) return "Web browser";
  return "Unknown client";
}

// Diagnostics must never delay a login, logout, or authenticated request.
// The bounded retry buffer survives a DB interruption; Render logs are the
// fallback if the process restarts before buffered events can be saved.
export function recordSessionEvent(req: Request, subject: Subject, reason: SessionReason,
  outcome: SessionOutcome, actor?: Subject): void {
  try {
    const userId = subject.id || subject.userId;
    if (!userId || !Object.values(UserRole).includes(subject.role as UserRole)) return;
    const occurredAt = new Date();
    const client = sessionClient(req);
    const header = String(req.headers.authorization || "");
    const deduplicate = outcome === "SESSION_REJECTED" || outcome === "CHECK_INTERRUPTED";
    const eventKey = deduplicate
      ? createHmac("sha256", env.JWT_SECRET).update("staff-session-log-v1\0" + header + "\0" + userId + "\0" + reason + "\0" + client + "\0" + Math.floor(occurredAt.getTime() / 300000)).digest("hex")
      : randomUUID();
    if (deduplicate && recent.has(eventKey)) return;
    for (const [key, time] of recent) if (time < occurredAt.getTime() - 600000) recent.delete(key);
    if (recent.size >= MAX_BUFFER) recent.delete(recent.keys().next().value!);
    recent.set(eventKey, occurredAt.getTime());
    const entry: Entry = { id: randomUUID(), eventKey, occurredAt, userId, staffName: nameOf(subject),
      role: subject.role as UserRole, client, reason, outcome,
      actorId: actor?.id || actor?.userId || null, actorName: nameOf(actor) };
    // No token, password, email, raw user-agent, IP, request body, or URL is logged.
    console.info(JSON.stringify({ event: "STAFF_SESSION_EVENT", ...entry, eventKey: undefined }));
    if (queue.size >= MAX_BUFFER) {
      queue.delete(queue.keys().next().value!);
      console.warn("[session-log] Buffer full; oldest event remains in service logs");
    }
    queue.set(eventKey, entry);
    if (timer) void flushSessionEvents();
  } catch {
    console.warn("[session-log] Could not record session event");
  }
}

export function startSessionLogWriter(): () => void {
  if (!timer) {
    timer = setInterval(() => { void flushSessionEvents(); }, 30000);
    timer.unref();
  }
  void flushSessionEvents();
  return () => { if (timer) clearInterval(timer); timer = undefined; };
}

export function flushSessionEvents(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    for (const [key, entry] of queue) {
      try {
        await prisma.staffSessionEvent.upsert({ where: { eventKey: key }, create: entry, update: {} });
        queue.delete(key);
      } catch {
        console.warn("[session-log] Database write unavailable; event buffered and recorded in service logs");
        break;
      }
    }
  })().finally(() => { flushing = undefined; });
  return flushing;
}

export function sessionActor(req: Request): Subject | undefined {
  return (req as Request & { user?: Subject }).user;
}
