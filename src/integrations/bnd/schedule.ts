// Keep identical to speedy-dispatcher/src/bndSchedule.ts (verified in tests).
// Render builds the dispatcher in isolation. Toronto includes daylight saving.
export const BND_TIME_ZONE = "America/Toronto";
export type BndDayHours = { day: number; startMinute: number | null; endMinute: number | null };
export type BndHours = {
  weekly: BndDayHours[];
  today: { date: string; startAt: number | null; endAt: number | null } | null;
  checkedAt: number | null;
  refreshAt: number;
  source: "website" | "cached" | "fallback";
};
// Last verified public hours, 2026-10-22. Used only until a live/cached feed is available.
export const BND_FALLBACK_HOURS: BndHours = {
  weekly: Array.from({ length: 7 }, (_, day) => ({ day,
    startMinute: day === 0 ? 690 : 570, endMinute: day === 0 ? 1020 : day <= 3 ? 1200 : 1260 })),
  today: null, checkedAt: null, refreshAt: 0, source: "fallback",
};
let currentHours: BndHours = BND_FALLBACK_HOURS;
const clock = new Intl.DateTimeFormat("en-CA", {
  timeZone: BND_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
function localParts(time: number) {
  const parts = Object.fromEntries(clock.formatToParts(time).map(part => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
}
export function bndLocalDate(time: number) {
  const p = localParts(time);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
export function bndDateAfter(date: string, days: number) {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
export function bndLocalInstant(date: string, minute: number) {
  const target = Date.parse(`${date}T00:00:00Z`) + minute * 60_000;
  let result = target;
  for (let i = 0; i < 3; i++) {
    const at = localParts(result);
    const offset = Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute, at.second) - result;
    result = target - offset;
  }
  return result;
}
export function bndDayWindow(date: string, hours = currentHours) {
  if (hours.today?.date === date) return hours.today;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const rule = hours.weekly.find(rule => rule.day === day)!;
  return { date, startAt: rule.startMinute === null ? null : bndLocalInstant(date, rule.startMinute),
    endAt: rule.endMinute === null ? null : bndLocalInstant(date, rule.endMinute) };
}
export function parseBndHours(value: unknown): BndHours {
  if (!value || typeof value !== "object") throw new Error("Invalid B&D hours");
  const h = value as BndHours;
  if (!Array.isArray(h.weekly) || h.weekly.length !== 7 ||
      !["website", "cached", "fallback"].includes(h.source) ||
      !Number.isFinite(h.refreshAt) || (h.checkedAt !== null && !Number.isFinite(h.checkedAt))) throw new Error("Invalid B&D hours");
  const days = new Set<number>();
  for (const rule of h.weekly) {
    if (!rule || !Number.isInteger(rule.day) || rule.day < 0 || rule.day > 6 || days.has(rule.day)) throw new Error("Invalid B&D day");
    days.add(rule.day);
    if (rule.startMinute === null && rule.endMinute === null) continue;
    if (!Number.isInteger(rule.startMinute) || !Number.isInteger(rule.endMinute) ||
        rule.startMinute! < 0 || rule.endMinute! > 1440 || rule.startMinute! >= rule.endMinute!) throw new Error("Invalid B&D window");
  }
  if (h.today !== null) {
    const t = h.today;
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !Number.isFinite(Date.parse(t.date))) throw new Error("Invalid B&D date");
    if (!(t.startAt === null && t.endAt === null) &&
        (!Number.isFinite(t.startAt) || !Number.isFinite(t.endAt) || t.startAt! >= t.endAt! ||
        bndLocalDate(t.startAt!) !== t.date || t.endAt! > bndLocalInstant(bndDateAfter(t.date, 1), 0))) throw new Error("Invalid B&D daily window");
  }
  return { weekly: h.weekly.map(r => ({ day: r.day, startMinute: r.startMinute, endMinute: r.endMinute })),
    today: h.today ? { ...h.today } : null, checkedAt: h.checkedAt, refreshAt: h.refreshAt, source: h.source };
}
export function setBndHours(hours: BndHours) { currentHours = parseBndHours(hours); }
export function getBndHours() { return parseBndHours(currentHours); }
export function getBndSchedule(now = Date.now(), hours = currentHours) {
  const date = bndLocalDate(now);
  const today = bndDayWindow(date, hours);
  if (today.startAt !== null && today.endAt !== null) {
    if (now < today.startAt) return { open: false, nextChangeAt: today.startAt };
    if (now < today.endAt) return { open: true, nextChangeAt: today.endAt };
  }
  for (let n = 1; n <= 7; n++) {
    const next = bndDayWindow(bndDateAfter(date, n), hours);
    if (next.startAt !== null) return { open: false, nextChangeAt: next.startAt };
  }
  return { open: false, nextChangeAt: bndLocalInstant(bndDateAfter(date, 1), 0) };
}
export function nextBndCheckAt(earliest: number) {
  const schedule = getBndSchedule(earliest);
  return schedule.open ? earliest : schedule.nextChangeAt;
}
export function bndHoursLabel(now = Date.now()) {
  const day = bndDayWindow(bndLocalDate(now));
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: BND_TIME_ZONE, hour: "numeric", minute: "2-digit" });
  const hours = day.startAt === null ? "Closed today" : `Today ${format.format(day.startAt)}–${format.format(day.endAt!)} Toronto time`;
  return `${hours}${currentHours.source === "website" ? "" : " · using saved hours"}`;
}
