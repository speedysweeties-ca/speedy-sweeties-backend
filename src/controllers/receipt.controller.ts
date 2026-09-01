import { Request, Response } from "express";
import { OrderStatus, UserRole } from "@prisma/client";
import { messaging } from "../config/firebase";
import { prisma } from "../lib/prisma";

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
  fcmToken: string | null;
};

const sendOutForDeliveryNotification = async (
  fcmToken: string | null,
  grandTotal: number
): Promise<void> => {
  if (!fcmToken) {
    return;
  }

  try {
    await messaging.send({
      token: fcmToken,
      notification: {
        title: "Speedy Sweeties 🚗",
        body: `Your order is now out for delivery! Total: $${grandTotal.toFixed(2)}.`
      },
      data: {
        type: "ORDER_OUT_FOR_DELIVERY",
        status: OrderStatus.OUT_FOR_DELIVERY,
        receiptTotal: grandTotal.toFixed(2)
      },
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
      "ORDER_OUT_FOR_DELIVERY push failed:",
      error instanceof Error ? error.name : typeof error
    );
  }
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
      const receipt = await tx.digitalReceipt.upsert({
        where: { orderId },
        update: { itemTotal, deliveryCharge, taxOrFees, grandTotal, notes },
        create: {
          orderId,
          receiptNumber: `SS-${order.orderNumber}`,
          createdByDriverId: user.userId,
          itemTotal,
          deliveryCharge,
          taxOrFees,
          grandTotal,
          notes
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

      const now = new Date();
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          orderStatus: OrderStatus.OUT_FOR_DELIVERY,
          dispatchedAt: order.dispatchedAt ?? order.assignedAt ?? now,
          acceptedAt: order.acceptedAt ?? now,
          outForDeliveryAt: order.outForDeliveryAt ?? now
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

    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true }
    });

    if (!order) {
      return { kind: "notFound" as const };
    }

    const receipt = await tx.digitalReceipt.upsert({
      where: { orderId },
      update: { itemTotal, deliveryCharge, taxOrFees, grandTotal, notes },
      create: {
        orderId,
        receiptNumber: `SS-${order.orderNumber}`,
        createdByDriverId: user.userId,
        itemTotal,
        deliveryCharge,
        taxOrFees,
        grandTotal,
        notes
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

  if (receiptResult.transitionedToOutForDelivery) {
    await sendOutForDeliveryNotification(receiptResult.fcmToken, grandTotal);
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
