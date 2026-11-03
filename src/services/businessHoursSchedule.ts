// Compare civil Toronto times, not elapsed UTC hours (DST days are not always 24h).
const DAY = 1440;
const WEEK = 7 * DAY;
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});
export type OpeningPoint = {
  day?: number; hour?: number; minute?: number;
  date?: { year?: number; month?: number; day?: number };
};
export type OpeningHours = {
  periods?: Array<{ open?: OpeningPoint; close?: OpeningPoint }>;
  weekdayDescriptions?: string[];
};
export type SavedBusinessHours = {
  fetchedAt: string;
  placeId: string;
  businessName: string;
  regularOpeningHours?: OpeningHours;
  currentOpeningHours?: OpeningHours;
};
export function torontoMinute(now: Date): number {
  const parts = formatter.formatToParts(now);
  const part = (name: string) => Number(parts.find(p => p.type === name)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute")) / 60000;
}
export function dailyHoursSlot(now: Date): string {
  // Before 03:00 the previous day's slot remains in force. Startup catches up once.
  return new Date((torontoMinute(now) - 180) * 60000).toISOString().slice(0, 10);
}
const dateMinute = (point: OpeningPoint): number | null => {
  const d = point.date;
  if (!d || !Number.isInteger(d.year) || !Number.isInteger(d.month) || !Number.isInteger(d.day)) return null;
  if (d.month! < 1 || d.month! > 12 || d.day! < 1 || d.day! > 31) return null;
  return Date.UTC(d.year!, d.month! - 1, d.day!, point.hour ?? 0, point.minute ?? 0) / 60000;
};
const clockValid = (p: OpeningPoint) => Number.isInteger(p.hour ?? 0) &&
  (p.hour ?? 0) >= 0 && (p.hour ?? 0) < 24 && Number.isInteger(p.minute ?? 0) &&
  (p.minute ?? 0) >= 0 && (p.minute ?? 0) < 60;

export function evaluateBusinessHours(saved: SavedBusinessHours, now: Date): {
  isOpen: boolean; nextOpenText: string | null; stale: boolean;
} | null {
  const current = torontoMinute(now);
  const fetched = torontoMinute(new Date(saved.fetchedAt));
  if (!Number.isFinite(fetched) || fetched > current) return null;
  const today = Math.floor(current / DAY) * DAY;
  const firstDate = Math.floor(fetched / DAY) * DAY;
  // Google's current hours cover the fetch date plus six days, not seven elapsed days.
  const useCurrent = today < firstDate + WEEK && Array.isArray(saved.currentOpeningHours?.periods);
  const hours = useCurrent ? saved.currentOpeningHours : saved.regularOpeningHours;
  if (!Array.isArray(hours?.periods)) return null;
  const intervals: Array<[number, number]> = [];
  const sunday = today - new Date(today * 60000).getUTCDay() * DAY;
  for (const period of hours.periods) {
    const open = period?.open;
    const close = period?.close;
    if (!open || !clockValid(open) || (close && !clockValid(close))) return null;
    const datedOpen = dateMinute(open);
    if (useCurrent && datedOpen !== null) {
      const datedClose = close ? dateMinute(close) : firstDate + WEEK;
      if (datedClose === null || datedClose <= datedOpen) return null;
      intervals.push([datedOpen, Math.min(datedClose, firstDate + WEEK)]);
      continue;
    }
    if (!Number.isInteger(open.day) || open.day! < 0 || open.day! > 6) return null;
    // Google's regular 24/7 representation has Sunday 00:00 and no close.
    if (!close) {
      if (open.day !== 0 || (open.hour ?? 0) !== 0 || (open.minute ?? 0) !== 0) return null;
      intervals.push([today - WEEK, today + WEEK]);
      continue;
    }
    if (!Number.isInteger(close.day) || close.day! < 0 || close.day! > 6) return null;
    const start = open.day! * DAY + (open.hour ?? 0) * 60 + (open.minute ?? 0);
    let end = close.day! * DAY + (close.hour ?? 0) * 60 + (close.minute ?? 0);
    if (end <= start) end += WEEK;
    for (const offset of [-WEEK, 0, WEEK]) intervals.push([sunday + start + offset, sunday + end + offset]);
  }
  const isOpen = intervals.some(([start, end]) => current >= start && current < end);
  const next = intervals.map(([start]) => start).filter(start => start > current).sort((a, b) => a - b)[0];
  let nextOpenText: string | null = null;
  if (!isOpen && next !== undefined && (!useCurrent || next < firstDate + WEEK)) {
    const date = new Date(next * 60000);
    const difference = Math.floor(next / DAY) - Math.floor(current / DAY);
    const day = difference === 0 ? "today" : difference === 1 ? "tomorrow" :
      "on " + ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getUTCDay()];
    const h = date.getUTCHours();
    nextOpenText = `Speedy Sweeties will be open ${day} at ${h % 12 || 12}:${String(date.getUTCMinutes()).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}.`;
  }
  return { isOpen, nextOpenText, stale: dailyHoursSlot(new Date(saved.fetchedAt)) !== dailyHoursSlot(now) };
}
