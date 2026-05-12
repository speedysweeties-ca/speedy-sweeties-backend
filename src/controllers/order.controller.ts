import { Request, Response } from "express";
import {
  PrismaClient,
  Prisma,
  OrderStatus,
  OrderPriority,
  PaymentMethod
} from "@prisma/client";
import admin from "../config/firebase";

const prisma = new PrismaClient();

/* ================= TYPES ================= */

type IdParams = {
  id: string;
};

type UpdateStatusBody = {
  orderStatus: OrderStatus;
  cancellationReason?: string;
};

type UpdatePriorityBody = {
  priority: OrderPriority;
};

type CreateOrderItemInput = {
  name: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
};

type UpdateOrderItemInput = {
  name: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  price?: number;
};

type UpdateOrderDetailsBody = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  addressLine1: string;
  city: string;
  province: string;
  postalCode: string;
  additionalNotes?: string | null;
  paymentMethod: PaymentMethod;
  items: UpdateOrderItemInput[];
};

/* ================= HELPERS ================= */

const orderInclude = {
  items: true,
  assignedDriver: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true
    }
  }
} satisfies Prisma.OrderInclude;

const normalize = (value: string) => value.trim().toLowerCase();

const normalizePhone = (value: string) => value.replace(/\D/g, "");

const LOYALTY_FREE_DELIVERY_NOTE =
  "LOYALTY REWARD: Customer earned free delivery. Subtract $12 from this order and let the customer know delivery is free.";

const getItemPrice = (item: UpdateOrderItemInput): number => {
  return item.unitPrice ?? item.price ?? 0;
};

const expandCreateOrderItems = (
  items: CreateOrderItemInput[]
): CreateOrderItemInput[] => {
  const expandedItems: CreateOrderItemInput[] = [];

  for (const item of items) {
    if (!item.name || typeof item.name !== "string") continue;

    const splitNames = item.name
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    if (splitNames.length === 0) continue;

    for (const name of splitNames) {
      expandedItems.push({
        name,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice ?? 0,
        totalPrice: item.totalPrice ?? 0
      });
    }
  }

  return expandedItems;
};

const sendCustomerOutForDeliveryNotification = async (
  fcmToken: string | null,
  orderNumber?: number | null
): Promise<void> => {
  if (!fcmToken) {
    console.log("No customer FCM token found for this order");
    return;
  }

  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: "Speedy Sweeties",
        body: orderNumber
          ? `Order #${orderNumber} is now out for delivery.`
          : "Your order is now out for delivery."
      },
      data: {
        type: "ORDER_STATUS_UPDATE",
        status: OrderStatus.OUT_FOR_DELIVERY
      },
      android: {
        priority: "high",
        notification: {
          channelId: "speedy_sweeties_orders",
          sound: "default"
        }
      }
    });

    console.log("Customer OUT_FOR_DELIVERY notification sent");
  } catch (error) {
    console.error("Failed to send customer OUT_FOR_DELIVERY notification:", error);
  }
};

const sendCustomerRewardEarnedNotification = async (
  fcmToken: string | null
): Promise<void> => {
  if (!fcmToken) {
    console.log("No customer FCM token found for loyalty reward notification");
    return;
  }

  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: "Speedy Sweeties 🎉",
        body: "You earned a free delivery on your next order!"
      },
      data: {
        type: "LOYALTY_REWARD_EARNED"
      },
      android: {
        priority: "high",
        notification: {
          channelId: "speedy_sweeties_orders",
          sound: "default"
        }
      }
    });

    console.log("Customer loyalty reward notification sent");
  } catch (error) {
    console.error("Failed to send loyalty reward notification:", error);
  }
};

const sendCustomerRewardAppliedNotification = async (
  fcmToken: string | null
): Promise<void> => {
  if (!fcmToken) {
    console.log("No customer FCM token found for loyalty reward applied notification");
    return;
  }

  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: "Speedy Sweeties 🎉",
        body: "Your free delivery reward has been applied to this order."
      },
      data: {
        type: "LOYALTY_REWARD_APPLIED"
      },
      android: {
        priority: "high",
        notification: {
          channelId: "speedy_sweeties_orders",
          sound: "default"
        }
      }
    });

    console.log("Customer loyalty reward applied notification sent");
  } catch (error) {
    console.error("Failed to send loyalty reward applied notification:", error);
  }
};

const applyCustomerLoyaltyForDeliveredOrder = async (
  customerId: string | null,
  fcmToken: string | null
): Promise<void> => {
  if (!customerId) {
    console.log("No customerId found for delivered order. Loyalty not updated.");
    return;
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      loyaltyCompletedOrders: true,
      loyaltyRewardsEarned: true,
      loyaltyFreeDelivery: true
    }
  });

  if (!customer) {
    console.log("Customer not found. Loyalty not updated.");
    return;
  }

  const nextCompletedOrders = customer.loyaltyCompletedOrders + 1;

  if (nextCompletedOrders >= 10) {
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        loyaltyCompletedOrders: 0,
        loyaltyRewardsEarned: {
          increment: 1
        },
        loyaltyFreeDelivery: true
      }
    });

    await sendCustomerRewardEarnedNotification(fcmToken);

    console.log("Customer earned a free delivery reward.");
    return;
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      loyaltyCompletedOrders: nextCompletedOrders
    }
  });

  console.log(`Customer loyalty updated: ${nextCompletedOrders}/10 completed deliveries.`);
};

/* ================= CONTROLLERS ================= */

export const createOrderController = async (
  req: Request,
  res: Response
) => {
  const {
    customerName,
    customerPhone,
    customerEmail,
    addressLine1,
    city,
    province,
    postalCode,
    items,
    paymentMethod,
    additionalNotes,
    deliveryInstructions,
    notes,
    dispatcherNotes,
    fcmToken
  } = req.body;

  const baseNotes = [additionalNotes, deliveryInstructions, notes]
    .filter(Boolean)
    .map((v) => String(v).trim())
    .filter(Boolean);

  const normalizedEmail = customerEmail ? normalize(customerEmail) : null;
  const normalizedPhone = normalizePhone(customerPhone);
  const normalizedName = normalize(customerName);

  const incomingItems: CreateOrderItemInput[] = Array.isArray(items) ? items : [];
  const rawItems: CreateOrderItemInput[] = expandCreateOrderItems(incomingItems);

  let customer = await prisma.customer.findFirst({
    where: {
      OR: [{ normalizedPhone }, ...(normalizedEmail ? [{ normalizedEmail }] : [])]
    }
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        fullName: customerName.trim(),
        normalizedFullName: normalizedName,
        phone: customerPhone.trim(),
        normalizedPhone,
        email: normalizedEmail,
        normalizedEmail,
        addressLine1: addressLine1.trim(),
        city: city.trim(),
        province: province.trim(),
        postalCode: postalCode.trim().toUpperCase(),
        dispatcherNotes:
          typeof dispatcherNotes === "string" ? dispatcherNotes.trim() : null
      }
    });
  }

  const shouldApplyFreeDeliveryReward = customer.loyaltyFreeDelivery === true;

  const finalNotes = shouldApplyFreeDeliveryReward
    ? [...baseNotes, LOYALTY_FREE_DELIVERY_NOTE].join(" | ")
    : baseNotes.join(" | ");

  const order = await prisma.$transaction(async (tx) => {
    if (shouldApplyFreeDeliveryReward) {
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          loyaltyFreeDelivery: false,
          loyaltyRewardsUsed: {
            increment: 1
          }
        }
      });
    }

    const createdOrder = await tx.order.create({
      data: {
        customerId: customer.id,
        customerName: customerName.trim(),
        phone: customerPhone.trim(),
        email: customerEmail.trim().toLowerCase(),
        addressLine1: addressLine1.trim(),
        city: city.trim(),
        province: province.trim(),
        postalCode: postalCode.trim().toUpperCase(),
        itemsText: rawItems.map((i) => `${i.quantity}x ${i.name}`).join(", "),
        additionalNotes: finalNotes || null,
        paymentMethod,
        orderStatus: OrderStatus.PLACED,
        priority: OrderPriority.NORMAL,
        fcmToken: typeof fcmToken === "string" ? fcmToken : null
      }
    });

    for (const item of rawItems) {
      if (!item.name) continue;

      const cleanedItemName = item.name.trim();
      const normalizedItemName = normalize(cleanedItemName);

      let catalogItem = await tx.itemCatalog.findFirst({
        where: { normalizedName: normalizedItemName }
      });

      if (!catalogItem) {
        catalogItem = await tx.itemCatalog.create({
          data: {
            name: cleanedItemName,
            normalizedName: normalizedItemName
          }
        });
      }

      await tx.orderItem.create({
        data: {
          orderId: createdOrder.id,
          itemCatalogId: catalogItem.id,
          name: cleanedItemName,
          quantity: item.quantity || 1,
          price: item.unitPrice ?? 0
        }
      });
    }

    return tx.order.findUniqueOrThrow({
      where: { id: createdOrder.id },
      include: orderInclude
    });
  });

  if (shouldApplyFreeDeliveryReward) {
    await sendCustomerRewardAppliedNotification(
      typeof fcmToken === "string" ? fcmToken : null
    );
  }

  res.status(201).json({
    success: true,
    message: "Order created successfully",
    order
  });
};

export const getOrderByIdController = async (
  req: Request<IdParams>,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: orderInclude
  });

  if (!order) {
    res.status(404).json({
      success: false,
      message: "Order not found"
    });
    return;
  }

  res.status(200).json({
    success: true,
    order
  });
};

export const updateOrderDetailsController = async (
  req: Request<IdParams, {}, UpdateOrderDetailsBody>,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const {
    customerName,
    customerPhone,
    customerEmail,
    addressLine1,
    city,
    province,
    postalCode,
    additionalNotes,
    paymentMethod,
    items
  } = req.body;

  const existingOrder = await prisma.order.findUnique({
    where: { id },
    include: { items: true }
  });

  if (!existingOrder) {
    res.status(404).json({
      success: false,
      message: "Order not found"
    });
    return;
  }

  if (
    existingOrder.orderStatus === OrderStatus.DELIVERED ||
    existingOrder.orderStatus === OrderStatus.CANCELLED
  ) {
    res.status(400).json({
      success: false,
      message: "Delivered or cancelled orders cannot be edited"
    });
    return;
  }

  const normalizedEmail = customerEmail ? normalize(customerEmail) : null;
  const normalizedPhone = normalizePhone(customerPhone);
  const normalizedName = normalize(customerName);

  const updatedOrder = await prisma.$transaction(async (tx) => {
    let customer = await tx.customer.findFirst({
      where: {
        OR: [{ normalizedPhone }, ...(normalizedEmail ? [{ normalizedEmail }] : [])]
      }
    });

    if (!customer) {
      customer = await tx.customer.create({
        data: {
          fullName: customerName.trim(),
          normalizedFullName: normalizedName,
          phone: customerPhone.trim(),
          normalizedPhone,
          email: normalizedEmail,
          normalizedEmail,
          addressLine1: addressLine1.trim(),
          city: city.trim(),
          province: province.trim(),
          postalCode: postalCode.trim().toUpperCase()
        }
      });
    } else {
      customer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          fullName: customerName.trim(),
          normalizedFullName: normalizedName,
          phone: customerPhone.trim(),
          normalizedPhone,
          email: normalizedEmail,
          normalizedEmail,
          addressLine1: addressLine1.trim(),
          city: city.trim(),
          province: province.trim(),
          postalCode: postalCode.trim().toUpperCase()
        }
      });
    }

    await tx.orderItem.deleteMany({
      where: { orderId: id }
    });

    for (const item of items) {
      if (!item.name) continue;

      const normalizedItemName = normalize(item.name);

      let catalogItem = await tx.itemCatalog.findFirst({
        where: { normalizedName: normalizedItemName }
      });

      if (!catalogItem) {
        catalogItem = await tx.itemCatalog.create({
          data: {
            name: item.name.trim(),
            normalizedName: normalizedItemName
          }
        });
      }

      await tx.orderItem.create({
        data: {
          orderId: id,
          itemCatalogId: catalogItem.id,
          name: item.name.trim(),
          quantity: item.quantity || 1,
          price: getItemPrice(item)
        }
      });
    }

    await tx.order.update({
      where: { id },
      data: {
        customerId: customer.id,
        customerName: customerName.trim(),
        phone: customerPhone.trim(),
        email: customerEmail.trim().toLowerCase(),
        addressLine1: addressLine1.trim(),
        city: city.trim(),
        province: province.trim(),
        postalCode: postalCode.trim().toUpperCase(),
        itemsText: items.map((i) => `${i.quantity}x ${i.name}`).join(", "),
        additionalNotes:
          typeof additionalNotes === "string" && additionalNotes.trim()
            ? additionalNotes.trim()
            : null,
        paymentMethod
      }
    });

    return tx.order.findUniqueOrThrow({
      where: { id },
      include: orderInclude
    });
  });

  res.status(200).json({
    success: true,
    message: "Order updated successfully",
    order: updatedOrder
  });
};

export const updateOrderStatusController = async (
  req: Request<IdParams, {}, UpdateStatusBody>,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { orderStatus, cancellationReason } = req.body;

  const existingOrder = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderStatus: true,
      fcmToken: true,
      orderNumber: true,
      customerId: true,
      assignedAt: true,
      dispatchedAt: true,
      acceptedAt: true,
      outForDeliveryAt: true,
      deliveredAt: true
    }
  });

  if (!existingOrder) {
    res.status(404).json({
      success: false,
      message: "Order not found"
    });
    return;
  }

  if (
    orderStatus === OrderStatus.CANCELLED &&
    existingOrder.orderStatus === OrderStatus.DELIVERED
  ) {
    res.status(400).json({
      success: false,
      message: "Delivered orders cannot be cancelled"
    });
    return;
  }

  if (
    orderStatus === OrderStatus.CANCELLED &&
    existingOrder.orderStatus === OrderStatus.CANCELLED
  ) {
    res.status(400).json({
      success: false,
      message: "Order is already cancelled"
    });
    return;
  }

  const now = new Date();

  const cleanedCancellationReason =
    typeof cancellationReason === "string" && cancellationReason.trim()
      ? cancellationReason.trim()
      : null;

  const statusTimestampData: Prisma.OrderUpdateInput = {};

  if (orderStatus === OrderStatus.DISPATCHED) {
    statusTimestampData.dispatchedAt = existingOrder.dispatchedAt ?? now;
  }

  if (orderStatus === OrderStatus.ACCEPTED) {
    statusTimestampData.dispatchedAt =
      existingOrder.dispatchedAt ?? existingOrder.assignedAt ?? now;
    statusTimestampData.acceptedAt = existingOrder.acceptedAt ?? now;
  }

  if (orderStatus === OrderStatus.OUT_FOR_DELIVERY) {
    statusTimestampData.dispatchedAt =
      existingOrder.dispatchedAt ?? existingOrder.assignedAt ?? now;
    statusTimestampData.acceptedAt = existingOrder.acceptedAt ?? now;
    statusTimestampData.outForDeliveryAt = existingOrder.outForDeliveryAt ?? now;
  }

  if (orderStatus === OrderStatus.DELIVERED) {
    statusTimestampData.dispatchedAt =
      existingOrder.dispatchedAt ?? existingOrder.assignedAt ?? now;
    statusTimestampData.acceptedAt = existingOrder.acceptedAt ?? now;
    statusTimestampData.outForDeliveryAt = existingOrder.outForDeliveryAt ?? now;
    statusTimestampData.deliveredAt = existingOrder.deliveredAt ?? now;
  }

  const updatedOrder = await prisma.order.update({
    where: { id },
    data:
      orderStatus === OrderStatus.CANCELLED
        ? {
            orderStatus: OrderStatus.CANCELLED,
            cancelledAt: now,
            cancelledFromStatus: existingOrder.orderStatus,
            cancellationReason: cleanedCancellationReason
          }
        : {
            orderStatus,
            ...statusTimestampData
          },
    include: orderInclude
  });

  const shouldNotifyCustomer =
    orderStatus === OrderStatus.OUT_FOR_DELIVERY &&
    existingOrder.orderStatus !== OrderStatus.OUT_FOR_DELIVERY;

  if (shouldNotifyCustomer) {
    await sendCustomerOutForDeliveryNotification(
      existingOrder.fcmToken,
      existingOrder.orderNumber
    );
  }

  const shouldApplyLoyalty =
    orderStatus === OrderStatus.DELIVERED &&
    existingOrder.orderStatus !== OrderStatus.DELIVERED;

  if (shouldApplyLoyalty) {
    await applyCustomerLoyaltyForDeliveredOrder(
      existingOrder.customerId,
      existingOrder.fcmToken
    );
  }

  res.status(200).json({
    success: true,
    message:
      orderStatus === OrderStatus.CANCELLED
        ? "Order cancelled successfully"
        : "Order status updated successfully",
    order: updatedOrder
  });
};

export const updateOrderPriorityController = async (
  req: Request<IdParams, {}, UpdatePriorityBody>,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { priority } = req.body;

  if (priority !== OrderPriority.NORMAL && priority !== OrderPriority.HIGH) {
    res.status(400).json({
      success: false,
      message: "Invalid priority"
    });
    return;
  }

  const updatedOrder = await prisma.order.update({
    where: { id },
    data: { priority },
    include: orderInclude
  });

  res.status(200).json({
    success: true,
    message: "Order priority updated successfully",
    order: updatedOrder
  });
};

export const getPublicOrderTrackingController = async (
  req: Request<IdParams>,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        assignedDriver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            latitude: true,
            longitude: true,
            locationUpdatedAt: true
          }
        }
      }
    });

    if (!order) {
      res.status(404).json({
        success: false,
        message: "Order not found"
      });
      return;
    }

    const driver = order.assignedDriver;

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        driver: driver
          ? {
              name: `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim(),
              latitude: driver.latitude ?? null,
              longitude: driver.longitude ?? null,
              lastUpdated: driver.locationUpdatedAt ?? null
            }
          : null
      }
    });
  } catch (error) {
    console.error("Tracking error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch tracking info"
    });
  }
};