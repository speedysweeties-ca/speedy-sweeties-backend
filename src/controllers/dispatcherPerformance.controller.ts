import { UserRole } from "@prisma/client";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../lib/prisma";
import { buildDispatcherPerformance } from "../services/dispatcherPerformance.service";
import { buildGrowthDashboardDateRange } from "../services/growthDashboard.service";
import { ApiError } from "../utils/ApiError";

const readDateQuery = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const readDispatcherIds = (value: unknown): string[] => {
  if (typeof value !== "string") return [];

  const dispatcherIds = Array.from(
    new Set(
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );

  if (dispatcherIds.length > 100) {
    throw new Error("No more than 100 dispatchers can be selected.");
  }

  return dispatcherIds;
};

export const getDispatcherPerformanceController = async (
  req: Request,
  res: Response
): Promise<void> => {
  let range;
  let selectedDispatcherIds: string[];

  try {
    range = buildGrowthDashboardDateRange(
      readDateQuery(req.query.startDate),
      readDateQuery(req.query.endDate)
    );
    selectedDispatcherIds = readDispatcherIds(req.query.dispatcherIds);
  } catch (error) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      error instanceof Error ? error.message : "Invalid performance filters."
    );
  }

  const [dispatchers, orders, events] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: { in: [UserRole.ADMIN, UserRole.DISPATCHER] }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true
      }
    }),
    prisma.order.findMany({
      where: {
        createdAt: {
          gte: range.startUtc,
          lt: range.endExclusiveUtc
        }
      },
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        orderSource: true,
        dispatchSource: true,
        createdAt: true,
        manualEntryStartedAt: true,
        createdByUserId: true,
        dispatchedAt: true,
        dispatchedByUserId: true,
        deliveredAt: true,
        cancelledAt: true
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    }),
    prisma.dispatchEvent.findMany({
      where: {
        order: {
          createdAt: {
            gte: range.startUtc,
            lt: range.endExclusiveUtc
          }
        }
      },
      select: {
        orderId: true,
        eventType: true,
        dispatchSource: true,
        actorUserId: true,
        occurredAt: true
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }]
    })
  ]);

  const performance = buildDispatcherPerformance({
    dispatchers,
    orders,
    events,
    selectedDispatcherIds
  });

  res.status(StatusCodes.OK).json({
    success: true,
    generatedAt: new Date().toISOString(),
    timeZone: "America/Toronto",
    range: {
      startDate: range.startDate,
      endDate: range.endDate,
      days: range.days
    },
    ...performance
  });
};
