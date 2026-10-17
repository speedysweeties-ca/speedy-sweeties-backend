// Keep identical to speedy-dispatcher/src/bndSchedule.ts (verified in tests).
// Render builds the dispatcher in isolation. Use Toronto time, including DST.
export const BND_TIME_ZONE = "America/Toronto";
const clock = new Intl.DateTimeFormat("en-CA", {
  timeZone: BND_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function localParts(time: number) {
  const parts = Object.fromEntries(clock.formatToParts(time).map(part => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

export function getBndSchedule(now = Date.now()) {
  const local = localParts(now);
  const open = local.hour >= 10 && local.hour < 21;
  const target = Date.UTC(local.year, local.month - 1, local.day + (local.hour >= 21 ? 1 : 0), open ? 21 : 10);
  let nextChangeAt = target;
  // Resolve the offset at the target, rather than adding 13 hours across a DST change.
  for (let i = 0; i < 3; i++) {
    const at = localParts(nextChangeAt);
    const offset = Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute, at.second) - nextChangeAt;
    nextChangeAt = target - offset;
  }
  return { open, nextChangeAt };
}

export function nextBndCheckAt(earliest: number) {
  const schedule = getBndSchedule(earliest);
  return schedule.open ? earliest : schedule.nextChangeAt;
}
