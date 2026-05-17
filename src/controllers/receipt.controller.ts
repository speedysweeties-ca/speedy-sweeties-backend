import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue) || numberValue < 0) {
    throw new Error("Invalid receipt amount");
  }

  return Number(numberValue.toFixed(2));
}

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

  const itemTotal = toNumber(req.body.itemTotal);
  const deliveryCharge = toNumber(req.body.deliveryCharge);
  const taxOrFees = toNumber(req.body.taxOrFees);
  const grandTotal = toNumber(req.body.grandTotal);
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

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      assignedDriverId: true
    }
  });

  if (!order) {
    res.status(404).json({
      success: false,
      message: "Order not found"
    });
    return;
  }

  if (order.assignedDriverId && order.assignedDriverId !== user.userId) {
    res.status(403).json({
      success: false,
      message: "You can only create a receipt for your assigned order"
    });
    return;
  }

  const receiptNumber = `SS-${order.orderNumber}`;

  const receipt = await prisma.digitalReceipt.upsert({
    where: { orderId },
    update: {
      itemTotal,
      deliveryCharge,
      taxOrFees,
      grandTotal,
      notes
    },
    create: {
      orderId,
      receiptNumber,
      createdByDriverId: user.userId,
      itemTotal,
      deliveryCharge,
      taxOrFees,
      grandTotal,
      notes
    }
  });

  res.status(200).json({
    success: true,
    message: "Digital receipt saved",
    data: receipt
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