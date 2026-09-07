import { OrderStatus } from "@prisma/client";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../lib/prisma";
import {
  addCalendarDays,
  buildGrowthDashboardDateRange,
  buildGrowthPeriodMetrics,
  buildLiveGrowthSnapshot,
  GrowthDashboardOrder
} from "../services/growthDashboard.service";
import { ApiError } from "../utils/ApiError";

const readDateQuery = (value: unknown): string | undefined => {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const getFirstDeliveredDates = async (
  customerIds: string[]
): Promise<Map<string, Date>> => {
  if (customerIds.length === 0) return new Map();

  const deliveredCustomers = await prisma.order.groupBy({
    by: ["customerId"],
    where: {
      customerId: { in: customerIds },
      orderStatus: OrderStatus.DELIVERED
    },
    _min: {
      createdAt: true
    }
  });

  const firstDeliveredAtByCustomer = new Map<string, Date>();
  for (const customer of deliveredCustomers) {
    if (customer.customerId && customer._min.createdAt) {
      firstDeliveredAtByCustomer.set(
        customer.customerId,
        customer._min.createdAt
      );
    }
  }

  return firstDeliveredAtByCustomer;
};

export const getGrowthDashboardController = async (
  req: Request,
  res: Response
): Promise<void> => {
  let currentRange;

  try {
    currentRange = buildGrowthDashboardDateRange(
      readDateQuery(req.query.startDate),
      readDateQuery(req.query.endDate)
    );
  } catch (error) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      error instanceof Error ? error.message : "Invalid dashboard date range."
    );
  }

  const previousEndDate = addCalendarDays(currentRange.startDate, -1);
  const previousRange = buildGrowthDashboardDateRange(
    addCalendarDays(previousEndDate, -(currentRange.days - 1)),
    previousEndDate
  );

  const [periodOrders, activeOrders] = await Promise.all([
    prisma.order.findMany({
      where: {
        createdAt: {
          gte: previousRange.startUtc,
          lt: currentRange.endExclusiveUtc
        }
      },
      select: {
        id: true,
        customerId: true,
        paymentMethod: true,
        orderStatus: true,
        createdAt: true,
        dispatchedAt: true,
        deliveredAt: true,
        digitalReceipt: {
          select: {
            deliveryCharge: true,
            grandTotal: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    }),
    prisma.order.findMany({
      where: {
        orderStatus: {
          in: [
            OrderStatus.PLACED,
            OrderStatus.DISPATCHED,
            OrderStatus.ACCEPTED,
            OrderStatus.OUT_FOR_DELIVERY
          ]
        }
      },
      select: {
        orderStatus: true,
        createdAt: true,
        dispatchedAt: true
      }
    })
  ]);

  const currentOrders = periodOrders.filter(
    (order) =>
      order.createdAt >= currentRange.startUtc &&
      order.createdAt < currentRange.endExclusiveUtc
  ) as GrowthDashboardOrder[];
  const previousOrders = periodOrders.filter(
    (order) =>
      order.createdAt >= previousRange.startUtc &&
      order.createdAt < previousRange.endExclusiveUtc
  ) as GrowthDashboardOrder[];
  const customerIds = Array.from(
    new Set(
      periodOrders
        .map((order) => order.customerId)
        .filter((customerId): customerId is string => Boolean(customerId))
    )
  );
  const firstDeliveredAtByCustomer = await getFirstDeliveredDates(customerIds);

  res.status(StatusCodes.OK).json({
    success: true,
    generatedAt: new Date().toISOString(),
    timeZone: "America/Toronto",
    range: {
      startDate: currentRange.startDate,
      endDate: currentRange.endDate,
      days: currentRange.days
    },
    previousRange: {
      startDate: previousRange.startDate,
      endDate: previousRange.endDate,
      days: previousRange.days
    },
    current: buildGrowthPeriodMetrics(
      currentOrders,
      currentRange,
      firstDeliveredAtByCustomer
    ),
    previous: buildGrowthPeriodMetrics(
      previousOrders,
      previousRange,
      firstDeliveredAtByCustomer
    ),
    live: buildLiveGrowthSnapshot(activeOrders)
  });
};
