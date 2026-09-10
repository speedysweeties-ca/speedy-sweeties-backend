import { OrderSource, OrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getCurrentLoyaltyMonth } from "../services/loyalty.service";

const LOYALTY_SCOPE_REGRESSION_AT = new Date("2026-08-26T03:52:45.000Z");
const LOYALTY_REWARD_NOTE_MARKER = "LOYALTY REWARD: Customer earned free delivery.";
const includePii = process.argv.includes("--include-pii");

type AuditedOrder = {
  id: string;
  orderNumber: number;
  customerId: string | null;
  customerName: string;
  phone: string;
  orderSource: OrderSource;
  orderStatus: OrderStatus;
  additionalNotes: string | null;
  fcmToken: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  customer: {
    loyaltyCompletedOrders: number;
    loyaltyProgressMonth: string | null;
    loyaltyRewardsEarned: number;
    loyaltyRewardsUsed: number;
    loyaltyRewardBalance: number;
    loyaltyFreeDelivery: boolean;
  } | null;
};

const hasLegacyAppEvidence = (order: AuditedOrder): boolean => {
  return (
    order.orderSource === OrderSource.UNKNOWN &&
    typeof order.fcmToken === "string" &&
    order.fcmToken.trim().length > 0
  );
};

const isHistoricalAppOrder = (order: AuditedOrder): boolean => {
  return (
    order.orderSource === OrderSource.ANDROID_APP ||
    order.orderSource === OrderSource.IOS_APP ||
    hasLegacyAppEvidence(order)
  );
};

const run = async (): Promise<void> => {
  const orders: AuditedOrder[] = await prisma.order.findMany({
    where: {
      customerId: { not: null },
      OR: [
        { createdAt: { gte: LOYALTY_SCOPE_REGRESSION_AT } },
        { deliveredAt: { gte: LOYALTY_SCOPE_REGRESSION_AT } }
      ]
    },
    orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      customerName: true,
      phone: true,
      orderSource: true,
      orderStatus: true,
      additionalNotes: true,
      fcmToken: true,
      createdAt: true,
      deliveredAt: true,
      customer: {
        select: {
          loyaltyCompletedOrders: true,
          loyaltyProgressMonth: true,
          loyaltyRewardsEarned: true,
          loyaltyRewardsUsed: true,
          loyaltyRewardBalance: true,
          loyaltyFreeDelivery: true
        }
      }
    }
  });

  const currentLoyaltyMonth = getCurrentLoyaltyMonth();
  const customerRows = new Map<
    string,
    {
      customerId: string;
      customerName?: string;
      phone?: string;
      suspectedNonAppDeliveredOrderNumbers: number[];
      suspectedNonAppRewardOrderNumbers: number[];
      confirmedAppDeliveriesThisMonth: number;
      currentLoyalty: AuditedOrder["customer"];
    }
  >();

  let suspectedNonAppDeliveries = 0;
  let suspectedNonAppRewardRedemptions = 0;
  let legacyUnknownOrdersTreatedAsAppEvidence = 0;

  for (const order of orders) {
    if (hasLegacyAppEvidence(order)) {
      legacyUnknownOrdersTreatedAsAppEvidence += 1;
    }

    const historicalAppOrder = isHistoricalAppOrder(order);
    const suspectedDelivery =
      !historicalAppOrder && order.orderStatus === OrderStatus.DELIVERED;
    const suspectedRedemption =
      !historicalAppOrder &&
      Boolean(order.additionalNotes?.includes(LOYALTY_REWARD_NOTE_MARKER));
    const confirmedAppDeliveryThisMonth =
      historicalAppOrder &&
      order.orderStatus === OrderStatus.DELIVERED &&
      order.deliveredAt !== null &&
      getCurrentLoyaltyMonth(order.deliveredAt) === currentLoyaltyMonth;

    if (!suspectedDelivery && !suspectedRedemption && !confirmedAppDeliveryThisMonth) {
      continue;
    }

    if (!order.customerId) continue;

    const row = customerRows.get(order.customerId) ?? {
      customerId: order.customerId,
      ...(includePii
        ? { customerName: order.customerName, phone: order.phone }
        : {}),
      suspectedNonAppDeliveredOrderNumbers: [],
      suspectedNonAppRewardOrderNumbers: [],
      confirmedAppDeliveriesThisMonth: 0,
      currentLoyalty: order.customer
    };

    if (suspectedDelivery) {
      suspectedNonAppDeliveries += 1;
      row.suspectedNonAppDeliveredOrderNumbers.push(order.orderNumber);
    }

    if (suspectedRedemption) {
      suspectedNonAppRewardRedemptions += 1;
      row.suspectedNonAppRewardOrderNumbers.push(order.orderNumber);
    }

    if (confirmedAppDeliveryThisMonth) {
      row.confirmedAppDeliveriesThisMonth += 1;
    }

    customerRows.set(order.customerId, row);
  }

  const affectedCustomers = Array.from(customerRows.values())
    .filter(
      (row) =>
        row.suspectedNonAppDeliveredOrderNumbers.length > 0 ||
        row.suspectedNonAppRewardOrderNumbers.length > 0
    )
    .sort((a, b) => a.customerId.localeCompare(b.customerId));

  console.log(
    JSON.stringify(
      {
        readOnly: true,
        generatedAt: new Date().toISOString(),
        regressionWindowStart: LOYALTY_SCOPE_REGRESSION_AT.toISOString(),
        currentLoyaltyMonth,
        classification: {
          confirmedAppSources: [OrderSource.ANDROID_APP, OrderSource.IOS_APP],
          legacyAppEvidence: "UNKNOWN source with a non-empty order FCM token",
          excludedSources: [
            OrderSource.DISPATCHER_MANUAL,
            OrderSource.WEBFLOW,
            "UNKNOWN_WITHOUT_APP_TOKEN"
          ]
        },
        summary: {
          ordersReviewed: orders.length,
          affectedCustomers: affectedCustomers.length,
          suspectedNonAppDeliveries,
          suspectedNonAppRewardRedemptions,
          legacyUnknownOrdersTreatedAsAppEvidence
        },
        customers: affectedCustomers
      },
      null,
      2
    )
  );
};

run()
  .catch((error) => {
    console.error(
      "App-only loyalty audit failed:",
      error instanceof Error ? error.name : typeof error
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
