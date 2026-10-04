import { Prisma } from "@prisma/client";
import { getDriverFreshnessCutoff } from "./driverFreshness";

// Staff access changes and new assignments share this row lock. An order cannot
// be assigned between checking unfinished deliveries and deactivating a driver.
export const lockStaffAccount = async (tx: Prisma.TransactionClient, id: string) => {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
};

export const lockAssignableDriver = async (tx: Prisma.TransactionClient, id: string, now: Date): Promise<boolean> => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "User" WHERE "id" = ${id}
      AND "role" = 'DRIVER' AND "isActive" = true AND "isVisibleInDispatch" = true
      AND "isOnline" = true AND "passwordChangeRequired" = false
      AND "lastSeenAt" >= ${getDriverFreshnessCutoff(now)} FOR UPDATE
  `;
  return rows.length === 1;
};
