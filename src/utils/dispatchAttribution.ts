import { DispatchSource, UserRole } from "@prisma/client";

type DispatchAttribution = {
  dispatchSource?: DispatchSource;
  dispatchedByUserId?: string | null;
};

export const getFirstDispatchAttribution = (
  dispatchedAt: Date | null,
  actor?: { userId?: string; role?: UserRole }
): DispatchAttribution => {
  if (dispatchedAt) {
    return {};
  }

  if (actor?.role === UserRole.DRIVER) {
    return {
      dispatchSource: DispatchSource.DRIVER,
      dispatchedByUserId: null
    };
  }

  if (actor?.userId) {
    return {
      dispatchSource: DispatchSource.MANUAL,
      dispatchedByUserId: actor.userId
    };
  }

  return {};
};
