import { editPauseSelect } from "../services/orderEditPause.service";
import { OrderPriority, OrderStatus, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

const prioritySortOrder: Record<OrderPriority, number> = {
  HIGH: 0,
  NORMAL: 1
};

const sortOrdersByPriorityThenOldest = <
  T extends { priority: OrderPriority; createdAt: Date }
>(
  orders: T[]
): T[] => {
  return [...orders].sort((a, b) => {
    const priorityDifference =
      prioritySortOrder[a.priority] - prioritySortOrder[b.priority];

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });
};

export const listAllOrdersController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const status =
    typeof req.query.status === "string"
      ? req.query.status.trim().toUpperCase()
      : undefined;

  const driverId =
    typeof req.query.driverId === "string"
      ? req.query.driverId.trim()
      : undefined;

  const startDate =
    typeof req.query.startDate === "string"
      ? req.query.startDate.trim()
      : undefined;

  const endDate =
    typeof req.query.endDate === "string"
      ? req.query.endDate.trim()
      : undefined;

  const page =
    req.query.page === undefined ? 1 : typeof req.query.page === "string" ? Number(req.query.page) : NaN;

  const rawCustomerSearch = req.query.customerSearch;
  if (
    rawCustomerSearch !== undefined &&
    (typeof rawCustomerSearch !== "string" || rawCustomerSearch.trim().length > 200)
  ) {
    res.status(400).json({ success: false, message: "Customer search must be text of 200 characters or fewer." });
    return;
  }
  const customerSearch = typeof rawCustomerSearch === "string" ? rawCustomerSearch.trim() : "";
  if (customerSearch.length === 1 || !Number.isSafeInteger(page) || page < 1) {
    res.status(400).json({ success: false, message: "Use at least 2 characters to search and a valid page number." });
    return;
  }

  const limit = 100;
  const skip = (page - 1) * limit;

  const whereClause: Prisma.OrderWhereInput = {};

  if (driverId) {
    const driverIds = driverId.split(",").map((id) => id.trim()).filter(Boolean);
    if (driverIds.length) whereClause.assignedDriverId = { in: driverIds };
  }

  if (customerSearch) {
    // Match order snapshots as well as the current customer profile. Old orders
    // without a linked customer must remain searchable after an address change.
    const contains = {
      contains: customerSearch.replace(/[\\%_]/g, "\\$&"),
      mode: "insensitive" as const
    };
    whereClause.OR = [
      { customerName: contains },
      { addressLine1: contains },
      { phone: contains },
      { customer: { fullName: contains } }
    ];

    if (/^[+\d\s().-]+$/.test(customerSearch)) {
      let digits = customerSearch.replace(/\D/g, "");
      if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
      if (digits.length >= 3) {
        // Historical order phone snapshots can contain arbitrary punctuation.
        // Bind the digits as a SQL parameter; never interpolate search text.
        const phoneMatches = await prisma.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Order"
          WHERE regexp_replace("phone", '[^0-9]', '', 'g') LIKE ${`%${digits}%`}
        `;
        whereClause.OR.push(
          { id: { in: phoneMatches.map((order) => order.id) } },
          { customer: { normalizedPhone: { contains: digits } } }
        );
      }
    }
  }

  if (status === "CANCELLED") {
    whereClause.orderStatus = OrderStatus.CANCELLED;
  } else if (status === "DELIVERED") {
    whereClause.orderStatus = OrderStatus.DELIVERED;
  } else if (status === "DISPATCHED") {
    whereClause.orderStatus = OrderStatus.DISPATCHED;
  } else {
    whereClause.orderStatus = {
      in: [
        OrderStatus.PLACED,
        OrderStatus.DISPATCHED,
        OrderStatus.ACCEPTED,
        OrderStatus.OUT_FOR_DELIVERY
      ]
    };
  }

  if (startDate || endDate) {
    whereClause.createdAt = {};

    if (startDate) {
      whereClause.createdAt.gte = new Date(`${startDate}T00:00:00`);
    }

    if (endDate) {
      whereClause.createdAt.lte = new Date(`${endDate}T23:59:59`);
    }
  }

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where: whereClause,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: limit,
      include: {
        items: true,
        dispatchEditPauses: { select: editPauseSelect },
        dispatchEvents: {
          where: { eventType: "ASSIGNED" },
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          take: 1, select: { occurredAt: true }
        },
        digitalReceipt: true,
        customer: {
          select: {
            dispatcherNotes: true
          }
        },
        assignedDriver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        dispatchedBy: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    }),

    prisma.order.count({
      where: whereClause
    })
  ]);

  const sortedOrders =
    status === "CANCELLED" || status === "DELIVERED"
      ? orders
      : sortOrdersByPriorityThenOldest(orders);

  const ordersWithNotes = sortedOrders.map((order) => ({
    ...order,
    firstDispatchedAt: order.dispatchEvents[0]?.occurredAt ?? order.dispatchedAt,
    dispatchTimingAsOf: new Date().toISOString(),
    dispatcherNotes: order.customer?.dispatcherNotes || null
  }));

  res.status(200).json({
    success: true,
    count: ordersWithNotes.length,
    totalCount,
    currentPage: page,
    totalPages: Math.ceil(totalCount / limit),
    orders: ordersWithNotes
  });
};
