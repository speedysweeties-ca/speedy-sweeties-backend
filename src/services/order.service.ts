import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma
} from "@prisma/client";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import { CreateOrderInput } from "../validators/order.validator";

type OrderWithItems = Prisma.OrderGetPayload<{
  include: { items: true };
}>;

function determineInitialPaymentStatus(paymentMethod: PaymentMethod): PaymentStatus {
  if (paymentMethod === PaymentMethod.VISA || paymentMethod === PaymentMethod.MASTERCARD) {
    return PaymentStatus.PAID;
  }

  return PaymentStatus.PENDING;
}

function validateStatusTransition(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus
): void {
  const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
    PLACED: ["ACCEPTED", "CANCELLED"],
    ACCEPTED: ["OUT_FOR_DELIVERY", "CANCELLED"],
    OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
    DELIVERED: [],
    CANCELLED: []
  };

  if (currentStatus === nextStatus) {
    return;
  }

  const allowed = allowedTransitions[currentStatus];

  if (!allowed.includes(nextStatus)) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `Invalid status transition from ${currentStatus} to ${nextStatus}`
    );
  }
}

export async function createOrder(data: CreateOrderInput): Promise<OrderWithItems> {
  const paymentMethod = data.paymentMethod as PaymentMethod;
  const paymentStatus = determineInitialPaymentStatus(paymentMethod);

  const order = await prisma.order.create({
    data: {
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      city: data.city,
      province: data.province,
      postalCode: data.postalCode,
      deliveryInstructions: data.deliveryInstructions,
      notes: data.notes,
      subtotal: new Prisma.Decimal(data.subtotal),
      deliveryFee: new Prisma.Decimal(data.deliveryFee),
      tax: new Prisma.Decimal(data.tax),
      tip: new Prisma.Decimal(data.tip),
      discount: new Prisma.Decimal(data.discount),
      total: new Prisma.Decimal(data.total),
      paymentMethod,
      paymentStatus,
      orderStatus: OrderStatus.PLACED,
      items: {
        create: data.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(item.unitPrice),
          totalPrice: new Prisma.Decimal(item.totalPrice)
        }))
      }
    },
    include: {
      items: true
    }
  });

  return order;
}

export async function getOrderById(orderId: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true }
  });

  if (!order) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Order not found");
  }

  return order;
}

export async function listOrders(filters: {
  status?: OrderStatus;
  customerEmail?: string;
}): Promise<OrderWithItems[]> {
  const orders = await prisma.order.findMany({
    where: {
      orderStatus: filters.status,
      customerEmail: filters.customerEmail
    },
    include: { items: true },
    orderBy: {
      createdAt: "desc"
    }
  });

  return orders;
}

export async function updateOrderStatus(
  orderId: string,
  nextStatus: OrderStatus
): Promise<OrderWithItems> {
  const existingOrder = await prisma.order.findUnique({
    where: { id: orderId }
  });

  if (!existingOrder) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Order not found");
  }

  validateStatusTransition(existingOrder.orderStatus, nextStatus);

  const updateData: Prisma.OrderUpdateInput = {
    orderStatus: nextStatus
  };

  if (nextStatus === OrderStatus.ACCEPTED && !existingOrder.acceptedAt) {
    updateData.acceptedAt = new Date();
  }

  if (nextStatus === OrderStatus.DELIVERED && !existingOrder.deliveredAt) {
    updateData.deliveredAt = new Date();
  }

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: updateData,
    include: { items: true }
  });

  return updatedOrder;
}