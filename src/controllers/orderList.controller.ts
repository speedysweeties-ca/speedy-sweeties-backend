import { PrismaClient, OrderPriority, OrderStatus, Prisma } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

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

  // ✅ NEW — pagination
  const page =
    typeof req.query.page === "string" ? parseInt(req.query.page, 10) : 1;

  const limit = 100; // your choice
  const skip = (page - 1) * limit;

  const whereClause: Prisma.OrderWhereInput = {};

  if (driverId) {
    whereClause.assignedDriverId = driverId;
  }

  if (status === "CANCELLED") {
    whereClause.orderStatus = OrderStatus.CANCELLED;
  } else if (status === "DELIVERED") {
    whereClause.orderStatus = OrderStatus.DELIVERED;
  } else {
    whereClause.orderStatus = {
      in: [
        OrderStatus.PLACED,
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
      orderBy: {
        createdAt: "desc" // 🔥 newest first (important for pagination)
      },
      skip,
      take: limit,
      include: {
        items: true,
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