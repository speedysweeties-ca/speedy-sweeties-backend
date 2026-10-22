import {
  BND_FALLBACK_HOURS, BndHours, bndDateAfter, bndDayWindow, bndLocalDate,
  bndLocalInstant, getBndHours, parseBndHours, setBndHours,
} from "./schedule";

export const BND_HOURS_URL = "https://api.bddeliveries.ca/api/hours";
const RETRY_MS = 15 * 60_000;
export type BndHoursAudit = {
  date: string; startAt: string | null; endAt: string | null;
  source: BndHours["source"]; checkedAt: string | null;
};
function minute(value: unknown): number {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d:00$/.test(value)) throw new Error("Invalid public hours");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid public hours");
  return value as Record<string, unknown>;
}
export function parseBndPublicHours(value: unknown, now: number): BndHours {
  const raw = object(value);
  if (!Array.isArray(raw.default_hours) || typeof raw.closed_all_day !== "boolean") throw new Error("Invalid public hours");
  const weekly = raw.default_hours.map(value => {
    const r = object(value);
    if (!["America/New_York", "America/Toronto"].includes(String(r.time_zone)) ||
        typeof r.closed_all_day !== "boolean" || typeof r.day_of_week !== "number") throw new Error("Invalid public hours");
    return { day: r.day_of_week, startMinute: r.closed_all_day ? null : minute(r.start_time),
      endMinute: r.closed_all_day ? null : minute(r.end_time) };
  });
  const date = bndLocalDate(now);
  let startAt: number | null = null;
  let endAt: number | null = null;
  if (!raw.closed_all_day) {
    const today = object(raw.today_hours);
    for (const field of ["start_time", "end_time"]) {
      if (typeof today[field] !== "string" || !/Z$|[+-]\d{2}:\d{2}$/.test(today[field] as string)) throw new Error("Invalid public daily hours");
    }
    // The website feed includes incidental fractional seconds; boundaries are exact seconds.
    startAt = Math.floor(Date.parse(today.start_time as string) / 1000) * 1000;
    endAt = Math.floor(Date.parse(today.end_time as string) / 1000) * 1000;
  }
  const parsed = parseBndHours({ weekly, today: { date, startAt, endAt }, source: "website", checkedAt: now, refreshAt: now });
  parsed.refreshAt = nextRefresh(parsed, now);
  return parsed;
}
function nextRefresh(hours: BndHours, now: number) {
  const date = bndLocalDate(now);
  const day = bndDayWindow(date, hours);
  return day.startAt !== null && now < day.startAt ? day.startAt : bndLocalInstant(bndDateAfter(date, 1), 0);
}
async function readHours(response: Response) {
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > 32_768) {
    await response.body?.cancel();
    throw new Error("Hours unavailable");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 32_768) throw new Error("Hours too large");
      chunks.push(result.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export function createBndHoursProvider(options: {
  fetchImpl?: typeof fetch; now?: () => number;
  load?: () => Promise<string | null>;
  save?: (hours: BndHours, audit: BndHoursAudit) => Promise<void>;
  onError?: () => void;
} = {}) {
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? fetch;
  let initialized = false;
  let due = 0;
  let inFlight: Promise<void> | null = null;
  setBndHours(BND_FALLBACK_HOURS);
  async function refresh() {
    if (!initialized) {
      initialized = true;
      try {
        const saved = await options.load?.();
        if (saved) setBndHours({ ...parseBndHours(JSON.parse(saved)), source: "cached" });
      } catch { options.onError?.(); }
    }
    try {
      const response = await fetchImpl(BND_HOURS_URL, {
        headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10_000),
      });
      setBndHours(parseBndPublicHours(await readHours(response), now()));
      due = getBndHours().refreshAt;
    } catch {
      const saved = getBndHours();
      due = Math.min(now() + RETRY_MS, nextRefresh(saved, now()));
      setBndHours({ ...saved, source: saved.checkedAt === null ? "fallback" : "cached", refreshAt: due });
      options.onError?.();
    }
    const hours = getBndHours();
    const day = bndDayWindow(bndLocalDate(now()), hours);
    try {
      await options.save?.(hours, { date: day.date,
        startAt: day.startAt === null ? null : new Date(day.startAt).toISOString(),
        endAt: day.endAt === null ? null : new Date(day.endAt).toISOString(),
        source: hours.source, checkedAt: hours.checkedAt === null ? null : new Date(hours.checkedAt).toISOString() });
    } catch {
      due = Math.min(due, now() + RETRY_MS);
      setBndHours({ ...getBndHours(), refreshAt: due });
      options.onError?.();
    }
  }
  return {
    nextRefreshAt: () => due,
    refreshIfDue: async () => {
      if (inFlight) return inFlight;
      if (initialized && now() < due) return;
      inFlight = refresh().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
