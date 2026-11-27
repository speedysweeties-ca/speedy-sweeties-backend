import { OrderStatus, Prisma } from "@prisma/client";

// Reserved system item: never catalogued, priced by a client, or copied to a reorder.
// A full name avoids treating an ordinary product named "Flyer" as this instruction.
export const WELCOME_FLYER_ITEM_NAME = "Include welcome flyer — new customer (no charge)";

export const isWelcomeFlyerItem = (item: { name?: string | null }): boolean =>
  item.name?.trim().toLowerCase() === WELCOME_FLYER_ITEM_NAME.toLowerCase();

export const welcomeFlyerItem = () => ({
  name: WELCOME_FLYER_ITEM_NAME,
  quantity: 1,
  unitPrice: 0,
  totalPrice: 0
});

/** Call inside the order transaction AFTER assertPrivacyOrderAllowed's shared
 * transaction lock. That lock serializes lookup, eligibility and insertion,
 * including two simultaneous orders for a phone with no Customer row yet.
 * Check history, not monthly loyalty counters. Include legacy duplicate profiles
 * with the same canonical phone; cancelled orders do not consume eligibility.
 */
export const isFirstCustomerOrder = async (
  tx: Prisma.TransactionClient,
  customerId: string,
  normalizedPhone: string,
  excludeOrderId?: string
): Promise<boolean> => {
  const priorOrder = await tx.order.findFirst({
    where: {
      OR: [{ customerId }, { customer: { normalizedPhone } }],
      orderStatus: { not: OrderStatus.CANCELLED },
      ...(excludeOrderId ? { id: { not: excludeOrderId } } : {})
    },
    select: { id: true }
  });
  return priorOrder === null;
};
