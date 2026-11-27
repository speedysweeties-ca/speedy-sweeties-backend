import { logDiagnostic, setDiagnosticOrder } from "../utils/operationalDiagnostics";
import { validReceiptItems, sameReceiptItems, receiptItemsFingerprint } from "../services/receiptItems.service";
import { assertNoSyntheticReceipt } from "../services/syntheticOrderSafety.service";
import { Request, Response } from "express";
import { OrderStatus, UserRole } from "@prisma/client";
import { sendCustomerOrderNotification } from "../services/customerOrderNotification.service";
import { prisma } from "../lib/prisma";
import {
  buildOrderTransitionTimestampData,
  evaluateOrderStatusTransition
} from "../services/orderStateTransition.service";

const MAX_FINAL_RECEIPT_TOTAL = 50_000;

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error("Invalid receipt amount");
  }

  const roundedAmount = Number(numberValue.toFixed(2));

  if (roundedAmount > MAX_FINAL_RECEIPT_TOTAL) {
    throw new Error("Receipt amount exceeds the allowed maximum");
  }

  return roundedAmount;
}

const toCents = (value: number): number => Math.round(value * 100);

type LockedDriverOrder = {
  id: string;
  orderNumber: number;
  orderStatus: OrderStatus;
  assignedAt: Date | null;
  dispatchedAt: Date | null;
  acceptedAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
  fcmToken: string | null;
};

function getOrderIdFromParams(req: Request): string {
  const rawId = req.params.id;

  if (Array.isArray(rawId)) {
    return rawId[0];
  }

  return rawId;
}

export const createOrUpdateReceiptController = async (
  req: Request,
  res: Response
) => {
  const orderId = getOrderIdFromParams(req);
  const user = (req as any).user;

  let itemTotal: number;
  let deliveryCharge: number;
  let taxOrFees: number;
  let grandTotal: number;

  try {
    itemTotal = toNumber(req.body.itemTotal);
    deliveryCharge = toNumber(req.body.deliveryCharge);
    taxOrFees = toNumber(req.body.taxOrFees);
    grandTotal = toNumber(req.body.grandTotal);
  } catch (_error) {
    res.status(400).json({
      success: false,
      message: "Invalid receipt amount"
    });
    return;
  }
  const expectedItems = req.body.expectedItems;
  // Optional only for installed legacy clients during the staged app rollout.
  // Updated apps always submit the exact item snapshot used by their calculator.
  if (expectedItems !== undefined && !validReceiptItems(expectedItems)) {
    res.status(400).json({ success: false, code: "INVALID_RECEIPT_ITEMS", message: "Refresh the order and review its item prices before saving." });
    return;
  }
  const itemsFingerprint = user.role === UserRole.DRIVER && expectedItems !== undefined
    ? receiptItemsFingerprint(expectedItems) : null;
  const notes = req.body.notes ? String(req.body.notes) : null;

  if (!orderId) {
    res.status(400).json({
      success: false,
      message: "Order ID is required"
    });
    return;
  }

  if (grandTotal <= 0) {
    res.status(400).json({
      success: false,
      message: "Grand total must be greater than 0"
    });
    return;
  }

  const expectedGrandTotalCents =
    toCents(itemTotal) + toCents(deliveryCharge) + toCents(taxOrFees);

  if (toCents(grandTotal) !== expectedGrandTotalCents) {
    res.status(400).json({
      success: false,
      message: "Grand total must match the receipt components"
    });
    return;
  }

  const receiptResult = await prisma.$transaction(async (tx) => {
    await assertNoSyntheticReceipt(tx, orderId);
    if (user.role === UserRole.DRIVER) {
      const assignedOrders = await tx.$queryRaw<Array<LockedDriverOrder>>`
        SELECT
          "id",
          "orderNumber",
          "orderStatus",
          "assignedAt",
          "dispatchedAt",
          "acceptedAt",
          "outForDeliveryAt",
          "deliveredAt",
          "fcmToken"
        FROM "Order"
        WHERE "id" = ${orderId} AND "assignedDriverId" = ${user.userId}
        FOR UPDATE
      `;

      if (assignedOrders.length === 0) {
        const existingOrder = await tx.order.findUnique({
          where: { id: orderId },
          select: { id: true }
        });

        return existingOrder ? { kind: "forbidden" as const } : { kind: "notFound" as const };
      }

      const order = assignedOrders[0];
      setDiagnosticOrder(order.orderNumber);
      if (order.orderStatus === OrderStatus.DELIVERED || order.orderStatus === OrderStatus.CANCELLED) {
        return { kind: "finalized" as const };
      }
      if (expectedItems !== undefined) {
        const currentItems = await tx.orderItem.findMany({
          where: { orderId }, select: { id: true, name: true, quantity: true }
        });
        if (!sameReceiptItems(expectedItems, currentItems)) return { kind: "itemsChanged" as const };
      }
      const receipt = await tx.digitalReceipt.upsert({
        where: { orderId },
        update: { itemTotal, deliveryCharge, taxOrFees, grandTotal, notes, itemsFingerprint },
        create: {
          orderId,
          receiptNumber: `SS-${order.orderNumber}`,
          createdByDriverId: user.userId,
          itemTotal,
          deliveryCharge,
          taxOrFees,
          grandTotal,
          notes,
          itemsFingerprint
        }
      });

      if (order.orderStatus !== OrderStatus.ACCEPTED) {
        return {
          kind: "saved" as const,
          receipt,
          transitionedToOutForDelivery: false,
          order: null,
          fcmToken: null
        };
      }

      const transition = evaluateOrderStatusTransition({
        actor: "RECEIPT",
        currentStatus: order.orderStatus,
        targetStatus: OrderStatus.OUT_FOR_DELIVERY,
        hasPersistedReceipt: true
      });
      if ("code" in transition) {
        throw new Error(`Receipt transition rejected: ${transition.code}`);
      }

      const now = new Date();
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          orderStatus: OrderStatus.OUT_FOR_DELIVERY,
          ...buildOrderTransitionTimestampData(
            order,
            OrderStatus.OUT_FOR_DELIVERY,
            now
          )
        },
        select: {
          id: true,
          orderStatus: true,
          outForDeliveryAt: true
        }
      });

      return {
        kind: "saved" as const,
        receipt,
        transitionedToOutForDelivery: true,
        order: updatedOrder,
        fcmToken: order.fcmToken
      };
    }

    // Serialize staff receipt saves with delivery/cancellation, just like driver saves.
    const orders = await tx.$queryRaw<Array<Pick<LockedDriverOrder, "orderNumber" | "orderStatus">>>`
      SELECT "orderNumber", "orderStatus" FROM "Order"
      WHERE "id" = ${orderId} FOR UPDATE
    `;
    const order = orders[0];
    setDiagnosticOrder(order?.orderNumber);

    if (!order) {
      return { kind: "notFound" as const };
    }
    if (order.orderStatus === OrderStatus.DELIVERED || order.orderStatus === OrderStatus.CANCELLED) {
      return { kind: "finalized" as const };
    }

    const receipt = await tx.digitalReceipt.upsert({
      where: { orderId },
      update: { itemTotal, deliveryCharge, taxOrFees, grandTotal, notes, itemsFingerprint },
      create: {
        orderId,
        receiptNumber: `SS-${order.orderNumber}`,
        createdByDriverId: user.userId,
        itemTotal,
        deliveryCharge,
        taxOrFees,
        grandTotal,
        notes,
        itemsFingerprint
      }
    });

    return {
      kind: "saved" as const,
      receipt,
      transitionedToOutForDelivery: false,
      order: null,
      fcmToken: null
    };
  });

  if (receiptResult.kind === "finalized") {
    res.status(409).json({
      success: false,
      code: "FINAL_RECEIPT_LOCKED",
      message: "This order is delivered or cancelled. Its receipt cannot be changed."
    });
    return;
  }

  if (receiptResult.kind === "itemsChanged") {
    res.status(409).json({ success: false, code: "RECEIPT_ITEMS_CHANGED",
      message: "Dispatch changed this order's items. Refresh the order, review the item prices, and save again." });
    return;
  }

  if (receiptResult.kind === "notFound") {
    res.status(404).json({ success: false, message: "Order not found" });
    return;
  }

  if (receiptResult.kind === "forbidden") {
    res.status(403).json({
      success: false,
      message: "You can only create a receipt for your assigned order"
    });
    return;
  }

  logDiagnostic({ event: "RECEIPT_SAVE", outcome: "committed",
    ...(receiptResult.transitionedToOutForDelivery ? { action: "OUT_FOR_DELIVERY" } : {}) });
  if (receiptResult.transitionedToOutForDelivery) {
    await sendCustomerOrderNotification(orderId, "ORDER_OUT_FOR_DELIVERY");
  }

  res.status(200).json({
    success: true,
    message: receiptResult.transitionedToOutForDelivery
      ? "Digital receipt saved and order marked OUT_FOR_DELIVERY"
      : "Digital receipt saved",
    data: receiptResult.receipt,
    ...(receiptResult.order ? { order: receiptResult.order } : {})
  });
};

export const getReceiptByOrderController = async (
  req: Request,
  res: Response
) => {
  const orderId = getOrderIdFromParams(req);

  if (!orderId) {
    res.status(400).json({
      success: false,
      message: "Order ID is required"
    });
    return;
  }

  const user = (req as any).user;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { assignedDriverId: true }
  });

  if (
    user?.role === UserRole.DRIVER &&
    (!order || order.assignedDriverId !== user.userId)
  ) {
    res.status(403).json({
      success: false,
      message: "You can only view a receipt for your assigned order"
    });
    return;
  }

  const receipt = await prisma.digitalReceipt.findUnique({
    where: { orderId }
  });

  if (!receipt) {
    res.status(404).json({
      success: false,
      message: "Digital receipt not found"
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: receipt
  });
};
