export type DispatchEditPause = {
  startedAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
};

// Count the union, not the sum: two dispatchers/tabs editing together earn
// only one pause. Clip to creation and first dispatch, including stale leases.
export function editPauseMilliseconds(
  pauses: DispatchEditPause[] = [], start: Date, end: Date
): number {
  const lower = start.getTime();
  const upper = end.getTime();
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) return 0;
  const ranges = pauses.map(pause => [
    Math.max(lower, pause.startedAt.getTime()),
    Math.min(upper, pause.expiresAt.getTime(), pause.endedAt?.getTime() ?? upper)
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

export function dispatchWaitingMilliseconds(
  start: Date, end: Date, pauses: DispatchEditPause[] = []
): number {
  return Math.max(0, end.getTime() - start.getTime() - editPauseMilliseconds(pauses, start, end));
}
