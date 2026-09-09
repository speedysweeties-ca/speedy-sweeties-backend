import { Prisma } from "@prisma/client";

export const buildRoutablePickupLocationWhere = (
  pickupTypes: readonly string[]
): Prisma.PickupLocationWhereInput => ({
  isActive: true,
  pickupType: { in: [...pickupTypes] },
  OR: [
    { googleBusinessStatus: null },
    { googleBusinessStatus: "OPERATIONAL" }
  ]
});
