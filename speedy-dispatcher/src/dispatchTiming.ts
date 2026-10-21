export type EditPause = { startedAt: string; expiresAt: string; endedAt: string | null };
export type DispatchTimingOrder = {
  createdAt?: string | null;
  dispatchedAt?: string | null;
  firstDispatchedAt?: string | null;
  dispatchEditPauses?: EditPause[];
};

export function editPauseMilliseconds(order: DispatchTimingOrder, nowMs: number): number {
  const lower = Date.parse(order.createdAt || "");
  const first = Date.parse(order.firstDispatchedAt || order.dispatchedAt || "");
  const upper = Number.isFinite(first) ? Math.min(nowMs, first) : nowMs;
  if (!Number.isFinite(lower) || upper <= lower) return 0;
  const ranges = (order.dispatchEditPauses || []).map(pause => [
    Math.max(lower, Date.parse(pause.startedAt)),
    Math.min(upper, Date.parse(pause.expiresAt), pause.endedAt ? Date.parse(pause.endedAt) : upper)
  ]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cursor = lower;
  for (const [a, b] of ranges) {
    total += Math.max(0, b - Math.max(cursor, a));
    cursor = Math.max(cursor, b);
  }
  return total;
}

export function dispatchWaitingMilliseconds(order: DispatchTimingOrder, nowMs: number): number {
  const createdMs = Date.parse(order.createdAt || "");
  return Number.isFinite(createdMs)
    ? Math.max(0, nowMs - createdMs - editPauseMilliseconds(order, nowMs)) : 0;
}

export function isDispatchTimerPaused(order: DispatchTimingOrder, nowMs: number): boolean {
  if (order.firstDispatchedAt || order.dispatchedAt) return false;
  return (order.dispatchEditPauses || []).some(pause =>
    !pause.endedAt && Date.parse(pause.startedAt) <= nowMs && Date.parse(pause.expiresAt) > nowMs);
}
