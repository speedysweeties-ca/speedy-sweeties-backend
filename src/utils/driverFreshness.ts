export const DRIVER_FRESHNESS_THRESHOLD_MS = 60 * 60 * 1000;

export const getDriverFreshnessCutoff = (now: Date = new Date()): Date =>
  new Date(now.getTime() - DRIVER_FRESHNESS_THRESHOLD_MS);

export const isDriverFresh = (
  lastSeenAt: Date | null | undefined,
  now: Date = new Date()
): boolean =>
  Boolean(lastSeenAt && lastSeenAt.getTime() >= getDriverFreshnessCutoff(now).getTime());

export const isDriverLocationFresh = (
  lastSeenAt: Date | null | undefined,
  locationUpdatedAt: Date | null | undefined,
  now: Date = new Date()
): boolean =>
  isDriverFresh(lastSeenAt, now) &&
  Boolean(
    locationUpdatedAt &&
      locationUpdatedAt.getTime() >= getDriverFreshnessCutoff(now).getTime()
  );
