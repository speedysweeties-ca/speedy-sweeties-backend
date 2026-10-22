import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { BND_POLL_MS, BndObservedOrder } from "../integrations/bnd/monitor";

const FIVE_MINUTES_MS = 300_000;
const MAX_OBSERVATION_GAP_MS = 2 * BND_POLL_MS;

// Records observations only. Never opens, claims or changes an upstream order.
export async function recordBndSnapshot(orders: BndObservedOrder[], observedAt: Date, db = prisma): Promise<void> {
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Serialize overlapping deploys and ignore snapshots that arrive out of order.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(57226, 1)`;
    const latest = await tx.bndMonitorCheck.findFirst({ orderBy: { checkedAt: "desc" } });
    if (latest && latest.checkedAt >= observedAt) return;
    await tx.bndMonitorCheck.create({ data: {
      checkedAt: observedAt, pendingCount: orders.filter(order => !order.claimed).length,
    } });
    const current = new Map(orders.map(order => [order.id, order]));
    const continuing = new Set<string>();
    const active = await tx.bndWaitingPeriod.findMany({ where: { endObservedAt: null } });
    for (const period of active) {
      const order = current.get(period.orderId);
      const gap = observedAt.getTime() - period.lastSeenWaitingAt.getTime();
      if (!order || order.claimed || gap > MAX_OBSERVATION_GAP_MS) {
        await tx.bndWaitingPeriod.update({ where: { id: period.id }, data: {
          endObservedAt: observedAt,
          endReason: !order ? "MISSING" : order.claimed ? "CLAIMED" : "GAP",
        } });
        continue;
      }
      continuing.add(order.id);
      await tx.bndWaitingPeriod.update({ where: { id: period.id }, data: {
        lastSeenWaitingAt: observedAt,
        overFiveMinutesAt: period.overFiveMinutesAt ?? (
          observedAt.getTime() - period.firstSeenAt.getTime() > FIVE_MINUTES_MS ? observedAt : null
        ),
      } });
    }
    const newPeriods = orders.filter(order => !order.claimed && !continuing.has(order.id));
    if (newPeriods.length) await tx.bndWaitingPeriod.createMany({ data: newPeriods.map(order => ({
      orderId: order.id, orderNumber: order.number, firstSeenAt: observedAt, lastSeenWaitingAt: observedAt,
    })) });
  }, { maxWait: 2000, timeout: 5000 });
}
