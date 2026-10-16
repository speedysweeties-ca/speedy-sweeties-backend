import { UserRole } from "@prisma/client";
import { Request } from "express";

export type CatalogCreator = {
  createdByUserId: string | null;
  createdByName: string | null;
};

type StaffUser = {
  userId: string;
  role: UserRole;
  firstName?: string | null;
  lastName?: string | null;
};

export const CUSTOMER_CATALOG_CREATOR: CatalogCreator = {
  createdByUserId: null,
  createdByName: "Customer"
};

// Use only the user attached by requireAuth, never request body attribution.
// Keep a name snapshot so later account renames/deletion do not rewrite history.
export const getStaffCatalogCreator = (user?: StaffUser): CatalogCreator => {
  if (!user?.userId) {
    return { createdByUserId: null, createdByName: null };
  }

  const name = [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  const roleLabel = user.role === UserRole.ADMIN ? "Admin" :
    user.role === UserRole.DISPATCHER ? "Dispatcher" : "Staff";

  return {
    createdByUserId: user.userId,
    createdByName: name || roleLabel
  };
};

export const getRequestStaffCatalogCreator = (req: Request): CatalogCreator =>
  getStaffCatalogCreator((req as Request & { user?: StaffUser }).user);
