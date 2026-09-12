import { UserRole } from "@prisma/client";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../lib/prisma";
import {
  buildDispatcherPerformance,
  DISPATCHER_PERFORMANCE_SOURCE_GROUPS,
  type DispatcherPerformanceSourceGroup
} from "../services/dispatcherPerformance.service";
import { buildGrowthDashboardDateRange } from "../services/growthDashboard.service";
import { ApiError } from "../utils/ApiError";

const readDateQuery = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const readDispatcherPerformanceDispatcherIds = (
  value: unknown
): string[] => {
  if (value === undefined) return [];

  const rawIds = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : null;

  if (!rawIds || rawIds.some((id) => typeof id !== "string")) {
    throw new Error("Dispatchers must be a list of IDs.");
  }

  const dispatcherIds = Array.from(
    new Set(
      rawIds
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );

  if (dispatcherIds.length > 100) {
    throw new Error("No more than 100 dispatchers can be selected.");
  }

  return dispatcherIds;
};

export const readDispatcherPerformanceSourceGroups = (
  value: unknown
): DispatcherPerformanceSourceGroup[] => {
  if (value === undefined) return [];
  const rawSourceGroups = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : null;

  if (
    !rawSourceGroups ||
    rawSourceGroups.some((sourceGroup) => typeof sourceGroup !== "string")
  ) {
    throw new Error("Order sources must be a list.");
  }

  const sourceGroups = Array.from(
    new Set(
      rawSourceGroups
        .map((sourceGroup) => sourceGroup.trim().toUpperCase())
        .filter(Boolean)
    )
  );
  const allowedSourceGroups = new Set<string>(
    DISPATCHER_PERFORMANCE_SOURCE_GROUPS
  );
  const invalidSourceGroup = sourceGroups.find(
    (sourceGroup) => !allowedSourceGroups.has(sourceGroup)
  );

  if (invalidSourceGroup) {
    throw new Error(`Invalid order source: ${invalidSourceGroup}.`);
  }

  return sourceGroups as DispatcherPerformanceSourceGroup[];
};

export const getDispatcherPerformanceController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const rawFilters = req.method === "POST" ? req.body : req.query;
  const filters =
    rawFilters && typeof rawFilters === "object"
      ? rawFilters
      : ({} as Record<string, unknown>);
  let range;
  let selectedDispatcherIds: string[];
  let selectedSourceGroups: DispatcherPerformanceSourceGroup[];

  try {
    range = buildGrowthDashboardDateRange(
      readDateQuery(filters.startDate),
      readDateQuery(filters.endDate)
    );
    selectedDispatcherIds = readDispatcherPerformanceDispatcherIds(
      filters.dispatcherIds
    );
    selectedSourceGroups = readDispatcherPerformanceSourceGroups(
      filters.sourceGroups
    );
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
    selectedDispatcherIds,
    selectedSourceGroups
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
