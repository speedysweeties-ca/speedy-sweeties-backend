import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { recordSessionEvent, sessionActor, sessionReasons, sessionOutcomes, SessionReason, SessionOutcome } from "../services/staffSessionLog.service";

const reportSchema = z.object({ reason: z.enum(["MANUAL_LOGOUT", "INACTIVITY_TIMEOUT", "CLIENT_SESSION_REJECTED"]) }).strict();
export const reportSessionLogout = async (req: Request, res: Response) => {
  const { reason } = reportSchema.parse(req.body);
  recordSessionEvent(req, sessionActor(req)!, reason, "CLIENT_REPORTED");
  res.set("Cache-Control", "no-store").status(202).json({ success: true });
};

const querySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(["DRIVER", "DISPATCHER", "ADMIN"]).optional(),
  before: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
}).strict();
export const listSessionEvents = async (req: Request, res: Response) => {
  const query = querySchema.parse(req.query);
  const before = query.before || new Date().toISOString();
  const where: Prisma.StaffSessionEventWhereInput = { occurredAt: { lte: new Date(before) } };
  if (query.role) where.role = query.role;
  if (query.search) {
    const people = await prisma.user.findMany({ where: { OR: [
      { firstName: { contains: query.search, mode: "insensitive" } },
      { lastName: { contains: query.search, mode: "insensitive" } },
    ] }, select: { id: true }, take: 200 });
    where.OR = [{ staffName: { contains: query.search, mode: "insensitive" } }, { userId: { in: people.map(person => person.id) } }];
  }
  const rows = await prisma.staffSessionEvent.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    skip: (query.page - 1) * 50, take: 51 });
  const ids = [...new Set(rows.flatMap(row => [row.userId, ...(row.actorId ? [row.actorId] : [])]))];
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const names = new Map(people.map(person => [person.id, [person.firstName, person.lastName].filter(Boolean).join(" ")]));
  res.set("Cache-Control", "no-store").json({ page: query.page, before, hasMore: rows.length > 50, events: rows.slice(0, 50).map(row => ({
    id: row.id, occurredAt: row.occurredAt, userId: row.userId,
    staffName: row.staffName || names.get(row.userId) || "Staff account", role: row.role, client: row.client,
    reason: row.reason, reasonLabel: sessionReasons[row.reason as SessionReason] || "Reason not reported",
    outcome: row.outcome, outcomeLabel: sessionOutcomes[row.outcome as SessionOutcome] || "Unconfirmed",
    actorName: row.actorName || (row.actorId ? names.get(row.actorId) || "Staff account" : null),
  })) });
};
