import { Request, Response } from "express";
import {
  PrismaClient,
  Prisma,
  OrderStatus,
  OrderPriority
} from "@prisma/client";

const prisma = new PrismaClient();

type AuthenticatedUser = {
  userId: string;
  email: string;
  role: string;
};

type CreateOrderItemInput = {
  name: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
};

const getAuthUser = (req: Request): AuthenticatedUser | undefined => {
  return (req as Request & { user?: AuthenticatedUser }).user;
};

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

export const createOrderController = async (req: Request, res: Response) => {
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

  const combinedNotes = [additionalNotes, deliveryInstructions, notes]
    .filter(Boolean)
    .map((v) => String(v).trim())
    .filter(Boolean)
    .join(" | ");

  const normalizedEmail = customerEmail ? normalize(customerEmail) : null;
  const normalizedPhone = normalizePhone(customerPhone);
  const normalizedName = normalize(customerName);

  const rawItems: CreateOrderItemInput[] = Array.isArray(items) ? items : [];

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

  const order = await prisma.$transaction(async (tx) => {
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
        additionalNotes: combinedNotes || null,
        paymentMethod,
        orderStatus: OrderStatus.PLACED,
        priority: OrderPriority.NORMAL,
        fcmToken: typeof fcmToken === "string" ? fcmToken : null
      }
    });

    for (const item of rawItems) {
      if (!item.name) continue;

      const normalizedItemName = normalize(item.name);

      let catalogItem = await tx.itemCatalog.findFirst({
        where: { normalizedName: normalizedItemName }
      });

      if (!catalogItem) {
        catalogItem = await tx.itemCatalog.create({
          data: {
            name: item.name,
            normalizedName: normalizedItemName
          }
        });
      }

      await tx.orderItem.create({
        data: {
          orderId: createdOrder.id,
          itemCatalogId: catalogItem.id,
          name: item.name,
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

  res.status(201).json({
    success: true,
    message: "Order created successfully",
    order
  });
};

export const getOrderByIdController = async (
  req: Request,
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

export const updateOrderStatusController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { orderStatus } = req.body;

  const updatedOrder = await prisma.order.update({
    where: { id },
    data: {
      orderStatus
    },
    include: orderInclude
  });

  res.status(200).json({
    success: true,
    message: "Order status updated successfully",
    order: updatedOrder
  });
};

export const updateOrderPriorityController = async (
  req: Request,
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
    data: {
      priority
    },
    include: orderInclude
  });

  res.status(200).json({
    success: true,
    message: "Order priority updated successfully",
    order: updatedOrder
  });
};

export const getPublicOrderTrackingController = async (
  req: Request,
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