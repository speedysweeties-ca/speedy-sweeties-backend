import { Prisma } from "@prisma/client";

type CustomerLookupIdentity = Readonly<{
  normalizedPhone: string;
  normalizedEmail: string | null;
}>;

/**
 * A customer's required normalized phone number is the canonical identity.
 * Email is deliberately excluded because manual orders can share a placeholder
 * email and different people can legitimately share an email address.
 */
export const buildCustomerLookupWhere = ({
  normalizedPhone
}: CustomerLookupIdentity): Prisma.CustomerWhereInput => ({
  normalizedPhone
});
