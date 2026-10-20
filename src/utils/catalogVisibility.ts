import type { Prisma } from "@prisma/client";
import { ROUTABLE_PICKUP_TYPE_OPTIONS } from "../constants/pickupTypes";

// Use for catalog discovery, never for the staff categorization queue or order history.
// An allowlist also keeps blank/invalid legacy pickup types out of suggestions.
export const selectableCatalogWhere = (): Prisma.ItemCatalogWhereInput => ({
  isActive: true,
  pickupType: { in: [...ROUTABLE_PICKUP_TYPE_OPTIONS] }
});
