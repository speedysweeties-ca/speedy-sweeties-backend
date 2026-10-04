import { createHash } from "crypto";
import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { getCurrentLoyaltyMonth, isLoyaltyEligibleOrderSource } from "./loyalty.service";

export const checkInOrderSelect = {
  id: true, orderNumber: true, orderStatus: true, deliveredAt: true,
  customerName: true, orderSource: true,
  digitalReceipt: { select: {
    receiptNumber: true, itemTotal: true, deliveryCharge: true, taxOrFees: true, grandTotal: true
  } },
  customer: { select: {
    loyaltyCompletedOrders: true, loyaltyProgressMonth: true, loyaltyRewardBalance: true
  } },
  helpRequest: { select: { id: true, status: true, createdAt: true, handledAt: true } }
} satisfies Prisma.OrderSelect;

type CheckInOrder = Prisma.OrderGetPayload<{ select: typeof checkInOrderSelect }>;

export async function findCheckInOrder(token: string, deliveredOnly = false) {
  const order = await prisma.order.findFirst({
    where: {
      trackingTokenHash: createHash("sha256").update(token).digest("hex"),
      trackingTokenExpiresAt: { gt: new Date() }
    },
    select: checkInOrderSelect
  });
  if (!order) throw new ApiError(404, "This tracking link is invalid or has expired. Please contact dispatch.");
  if (deliveredOnly && order.orderStatus !== OrderStatus.DELIVERED) {
    throw new ApiError(409, "Check-in is available after your delivery is completed.");
  }
  return order;
}

export function buildCheckInSession(order: CheckInOrder, now = new Date()) {
  const delivered = order.orderStatus === OrderStatus.DELIVERED;
  const receipt = order.digitalReceipt;
  const customer = order.customer;
  return {
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    deliveredAt: delivered ? order.deliveredAt : null,
    firstName: delivered ? order.customerName.trim().split(/\s+/)[0] : null,
    receipt: delivered && receipt ? {
      receiptNumber: receipt.receiptNumber,
      itemTotal: Number(receipt.itemTotal), deliveryCharge: Number(receipt.deliveryCharge),
      taxOrFees: Number(receipt.taxOrFees), grandTotal: Number(receipt.grandTotal)
    } : null,
    loyalty: delivered && customer ? {
      completedOrders: customer.loyaltyProgressMonth === getCurrentLoyaltyMonth(now)
        ? customer.loyaltyCompletedOrders : 0,
      target: 10,
      rewardBalance: customer.loyaltyRewardBalance,
      month: getCurrentLoyaltyMonth(now),
      thisOrderEligible: isLoyaltyEligibleOrderSource(order.orderSource)
    } : null,
    helpRequest: delivered ? order.helpRequest : null,
    // Identical review and sharing options for every completed delivery.
    reviewUrl: delivered && env.GOOGLE_PLACE_ID
      ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(env.GOOGLE_PLACE_ID)}` : null,
    shareUrl: "https://www.speedysweeties.ca/?utm_source=customer_share&utm_medium=referral&utm_campaign=sweetie_check_in",
    contactPhone: "519-826-8097"
  };
}
