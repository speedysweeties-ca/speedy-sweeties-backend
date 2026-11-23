import { OrderStatus, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { addCalendarDays, torontoDateStartUtc } from "../services/growthDashboard.service";

const PAGE_SIZE = 50;

/** Read-only history. Identity always comes from the verified staff session. */
export const getDriverHistoryController = async (req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const user = (req as Request & { user?: { userId: string; role: string } }).user;
  if (!user?.userId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  if (user.role !== "DRIVER") {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const { startDate, endDate } = req.query;
  const pageText = req.query.page ?? "1";
  const page = typeof pageText === "string" && /^[1-9]\d{0,5}$/.test(pageText) ? Number(pageText) : NaN;
  let startUtc: Date;
  let endExclusiveUtc: Date;
  try {
    if (typeof startDate !== "string" || typeof endDate !== "string" || !Number.isSafeInteger(page)) {
      throw new Error("Invalid history query");
    }
    startUtc = torontoDateStartUtc(startDate);
    endExclusiveUtc = torontoDateStartUtc(addCalendarDays(endDate, 1));
    if (startDate > endDate) throw new Error("Reversed date range");
  } catch {
    res.status(400).json({ success: false, message: "Choose valid From and To dates (YYYY-MM-DD), with From on or before To, and a valid page." });
    return;
  }

  const where: Prisma.OrderWhereInput = {
    assignedDriverId: user.userId,
    orderStatus: OrderStatus.DELIVERED,
    deliveredAt: { gte: startUtc, lt: endExclusiveUtc }
  };
  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: [{ deliveredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      // No contact details, entry codes, notes, tokens, receipt-editing or routing data.
      select: {
        id: true, orderNumber: true, customerName: true,
        addressLine1: true, city: true, deliveredAt: true
      }
    }),
    prisma.order.count({ where })
  ]);
  res.status(200).json({
    success: true, orders, totalCount, page, pageSize: PAGE_SIZE,
    totalPages: Math.ceil(totalCount / PAGE_SIZE), startDate, endDate,
    timeZone: "America/Toronto"
  });
};
