import { Prisma, OrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";

export const EDIT_PAUSE_LEASE_MS = 45_000;
export const editPauseSelect = { startedAt: true, expiresAt: true, endedAt: true } as const;

type Input = {
  orderId: string;
  actorUserId: string;
  sessionId: string;
  action: "start" | "heartbeat" | "stop";
};

export async function updateOrderEditPause(input: Input, now = new Date(), db = prisma) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Serialize session mutations for this order; start/stop races cannot
    // reopen a closed session or manufacture credit from a client clock.
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true, orderStatus: true, dispatchedAt: true,
        dispatchEvents: {
          where: { eventType: "ASSIGNED" }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          take: 1, select: { occurredAt: true }
        }
      }
    });
    if (!order) throw new ApiError(404, "Order not found");
    const firstDispatchedAt = order.dispatchEvents[0]?.occurredAt ?? order.dispatchedAt;
    const eligible = order.orderStatus === OrderStatus.PLACED && !firstDispatchedAt;
    let session = await tx.orderEditPause.findUnique({ where: { id: input.sessionId } });
    if (session && (session.orderId !== input.orderId || session.actorUserId !== input.actorUserId)) {
      throw new ApiError(403, "This edit session belongs to another editor");
    }

    if (input.action === "stop" || !eligible) {
      if (session && !session.endedAt) {
        session = await tx.orderEditPause.update({
          where: { id: session.id },
          data: { endedAt: new Date(Math.min(now.getTime(), session.expiresAt.getTime())) }
        });
      } else if (!session && input.action === "stop") {
        // A stop can beat its start over the network. Leave a zero-duration
        // tombstone so the late start is idempotent and stays stopped.
        session = await tx.orderEditPause.create({ data: {
          id: input.sessionId, orderId: input.orderId, actorUserId: input.actorUserId,
          startedAt: now, expiresAt: now, endedAt: now
        } });
      }
    } else if (!session) {
      if (input.action !== "start") throw new ApiError(409, "Start a new edit pause session");
      session = await tx.orderEditPause.create({ data: {
        id: input.sessionId, orderId: input.orderId, actorUserId: input.actorUserId,
        startedAt: now, expiresAt: new Date(now.getTime() + EDIT_PAUSE_LEASE_MS)
      } });
    } else if (!session.endedAt && session.expiresAt > now) {
      session = await tx.orderEditPause.update({ where: { id: session.id }, data: {
        expiresAt: new Date(now.getTime() + EDIT_PAUSE_LEASE_MS)
      } });
    } else if (!session.endedAt || input.action === "heartbeat") {
      // Expired time stays expired. The browser must create a new interval.
      throw new ApiError(409, "Edit pause expired; start a new session");
    }

    const dispatchEditPauses = await tx.orderEditPause.findMany({
      where: { orderId: input.orderId }, select: editPauseSelect, orderBy: { startedAt: "asc" }
    });
    return {
      orderId: order.id, orderStatus: order.orderStatus, dispatchedAt: order.dispatchedAt,
      firstDispatchedAt, dispatchEditPauses,
      paused: Boolean(eligible && session && !session.endedAt && session.expiresAt > now),
      serverNow: now
    };
  });
}
