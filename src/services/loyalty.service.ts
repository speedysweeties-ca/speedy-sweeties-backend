import { Prisma } from "@prisma/client";
import { messaging } from "../config/firebase";
import { prisma } from "../lib/prisma";

const LOYALTY_TIME_ZONE = "America/Toronto";
const LOYALTY_DELIVERIES_PER_REWARD = 10;

type LoyaltyNotification =
  | "LOYALTY_REWARD_EARNED"
  | "LOYALTY_REWARD_APPLIED"
  | "LOYALTY_PROGRESS_UPDATE"
  | null;

export type LoyaltyMutationResult = {
  customerFound: boolean;
  progressIncreased: boolean;
  rewardEarned: boolean;
  rewardRedeemed: boolean;
  monthReset: boolean;
  completedOrders: number;
  notification: LoyaltyNotification;
  notificationShouldBeAttempted: boolean;
};

type LockedLoyaltyCustomer = {
  id: string;
  recurringDriverNotes: string | null;
  loyaltyCompletedOrders: number;
  loyaltyProgressMonth: string | null;
  loyaltyRewardsEarned: number;
  loyaltyRewardsUsed: number;
  loyaltyRewardBalance: number;
  loyaltyFreeDelivery: boolean;
};

const loyaltyCustomerSelect = {
  id: true,
  recurringDriverNotes: true,
  loyaltyCompletedOrders: true,
  loyaltyProgressMonth: true,
  loyaltyRewardsEarned: true,
  loyaltyRewardsUsed: true,
  loyaltyRewardBalance: true,
  loyaltyFreeDelivery: true
} satisfies Prisma.CustomerSelect;

export const getCurrentLoyaltyMonth = (date: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LOYALTY_TIME_ZONE,
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  if (!year || !month) {
    throw new Error("Unable to determine the current loyalty calendar month.");
  }

  return `${year}-${month}`;
};

const noCustomerResult = (): LoyaltyMutationResult => ({
  customerFound: false,
  progressIncreased: false,
  rewardEarned: false,
  rewardRedeemed: false,
  monthReset: false,
  completedOrders: 0,
  notification: null,
  notificationShouldBeAttempted: false
});

/**
 * PostgreSQL row locks are transaction-scoped and therefore serialize this customer's
 * loyalty decisions across every Render process, not merely within one Node process.
 */
export const lockCustomerLoyalty = async (
  tx: Prisma.TransactionClient,
  customerId: string
): Promise<LockedLoyaltyCustomer | null> => {
  const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Customer"
    WHERE "id" = ${customerId}
    FOR UPDATE
  `;

  if (lockedRows.length === 0) return null;

  return tx.customer.findUnique({
    where: { id: customerId },
    select: loyaltyCustomerSelect
  });
};

const resetLoyaltyMonthIfNeeded = async (
  tx: Prisma.TransactionClient,
  customer: LockedLoyaltyCustomer,
  now: Date
): Promise<{ customer: LockedLoyaltyCustomer; monthReset: boolean }> => {
  const currentMonth = getCurrentLoyaltyMonth(now);

  if (customer.loyaltyProgressMonth === currentMonth) {
    return { customer, monthReset: false };
  }

  const updatedCustomer = await tx.customer.update({
    where: { id: customer.id },
    data: {
      loyaltyCompletedOrders: 0,
      loyaltyProgressMonth: currentMonth
    },
    select: loyaltyCustomerSelect
  });

  return { customer: updatedCustomer, monthReset: true };
};

/**
 * Runs inside the caller's order-creation transaction. A reward is removed only if
 * that enclosing transaction commits the order successfully.
 */
export const redeemFreeDeliveryRewardForOrder = async (
  tx: Prisma.TransactionClient,
  customerId: string,
  now: Date = new Date()
): Promise<{ customer: LockedLoyaltyCustomer | null; result: LoyaltyMutationResult }> => {
  const lockedCustomer = await lockCustomerLoyalty(tx, customerId);
  if (!lockedCustomer) {
    return { customer: null, result: noCustomerResult() };
  }

  const { customer, monthReset } = await resetLoyaltyMonthIfNeeded(
    tx,
    lockedCustomer,
    now
  );

  if (customer.loyaltyRewardBalance <= 0) {
    return {
      customer,
      result: {
        customerFound: true,
        progressIncreased: false,
        rewardEarned: false,
        rewardRedeemed: false,
        monthReset,
        completedOrders: customer.loyaltyCompletedOrders,
        notification: null,
        notificationShouldBeAttempted: false
      }
    };
  }

  const nextRewardBalance = customer.loyaltyRewardBalance - 1;
  const updatedCustomer = await tx.customer.update({
    where: { id: customer.id },
    data: {
      loyaltyRewardBalance: nextRewardBalance,
      loyaltyRewardsUsed: { increment: 1 },
      loyaltyFreeDelivery: nextRewardBalance > 0
    },
    select: loyaltyCustomerSelect
  });

  return {
    customer: updatedCustomer,
    result: {
      customerFound: true,
      progressIncreased: false,
      rewardEarned: false,
      rewardRedeemed: true,
      monthReset,
      completedOrders: updatedCustomer.loyaltyCompletedOrders,
      notification: "LOYALTY_REWARD_APPLIED",
      notificationShouldBeAttempted: true
    }
  };
};

export const recordDeliveredOrderLoyalty = async (
  customerId: string | null,
  now: Date = new Date()
): Promise<LoyaltyMutationResult> => {
  if (!customerId) return noCustomerResult();

  return prisma.$transaction(async (tx) => {
    const lockedCustomer = await lockCustomerLoyalty(tx, customerId);
    if (!lockedCustomer) return noCustomerResult();

    const { customer, monthReset } = await resetLoyaltyMonthIfNeeded(
      tx,
      lockedCustomer,
      now
    );
    const nextCompletedOrders = customer.loyaltyCompletedOrders + 1;

    if (nextCompletedOrders >= LOYALTY_DELIVERIES_PER_REWARD) {
      const updatedCustomer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          loyaltyCompletedOrders: 0,
          loyaltyProgressMonth: getCurrentLoyaltyMonth(now),
          loyaltyRewardsEarned: { increment: 1 },
          loyaltyRewardBalance: { increment: 1 },
          loyaltyFreeDelivery: true
        },
        select: loyaltyCustomerSelect
      });

      return {
        customerFound: true,
        progressIncreased: true,
        rewardEarned: true,
        rewardRedeemed: false,
        monthReset,
        completedOrders: updatedCustomer.loyaltyCompletedOrders,
        notification: "LOYALTY_REWARD_EARNED",
        notificationShouldBeAttempted: true
      };
    }

    const updatedCustomer = await tx.customer.update({
      where: { id: customer.id },
      data: {
        loyaltyCompletedOrders: nextCompletedOrders,
        loyaltyProgressMonth: getCurrentLoyaltyMonth(now)
      },
      select: loyaltyCustomerSelect
    });

    return {
      customerFound: true,
      progressIncreased: true,
      rewardEarned: false,
      rewardRedeemed: false,
      monthReset,
      completedOrders: updatedCustomer.loyaltyCompletedOrders,
      notification: "LOYALTY_PROGRESS_UPDATE",
      notificationShouldBeAttempted: true
    };
  });
};

export const getCustomerLoyaltySnapshot = async (
  customerId: string,
  now: Date = new Date()
): Promise<LockedLoyaltyCustomer | null> => {
  return prisma.$transaction(async (tx) => {
    const lockedCustomer = await lockCustomerLoyalty(tx, customerId);
    if (!lockedCustomer) return null;

    return (await resetLoyaltyMonthIfNeeded(tx, lockedCustomer, now)).customer;
  });
};

export const sendCustomerLoyaltyNotification = async (
  fcmToken: string | null,
  result: LoyaltyMutationResult
): Promise<void> => {
  if (!result.notificationShouldBeAttempted || !result.notification || !fcmToken) {
    return;
  }

  const notification =
    result.notification === "LOYALTY_REWARD_EARNED"
      ? {
          title: "Speedy Sweeties 🎉",
          body: "You earned a free delivery on your next order!"
        }
      : result.notification === "LOYALTY_REWARD_APPLIED"
        ? {
            title: "Speedy Sweeties 🎉",
            body: "Your free delivery reward has been applied to this order."
          }
        : {
            title: "Speedy Sweeties Rewards",
            body: `You only have ${LOYALTY_DELIVERIES_PER_REWARD - result.completedOrders} ${
              LOYALTY_DELIVERIES_PER_REWARD - result.completedOrders === 1
                ? "delivery"
                : "deliveries"
            } left for your next free delivery.`
          };

  try {
    await messaging.send({
      token: fcmToken,
      notification,
      data: { type: result.notification },
      android: {
        priority: "high",
        notification: {
          channelId: "speedy_sweeties_orders",
          sound: "default"
        }
      }
    });
  } catch (error) {
    console.error(
      `${result.notification} push failed:`,
      error instanceof Error ? error.name : typeof error
    );
  }
};
