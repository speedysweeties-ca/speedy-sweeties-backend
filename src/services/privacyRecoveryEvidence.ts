import type { Prisma } from "@prisma/client";
import { PrivacyRecoveryJournal } from "./privacyRecoveryJournal";
import type { RecoveryScope } from "./privacyRecoveryState";

// Read-only, process-local evidence. Raw rows NEVER enter the journal/plan/output.
// Bind the effects of the whole scoped transaction, not just its request flag.
export async function scopedRecoveryEvidence(tx: Prisma.TransactionClient, journal: PrivacyRecoveryJournal,
  requestId: string, scope: RecoveryScope) {
  const ids = scope.orders.map(o => o.id);
  const values = {
    request: await tx.privacyDeletionRequest.findUnique({ where: { id: requestId }, include: {
      tasks: { orderBy: { system: "asc" } }, audit: { orderBy: { id: "asc" } }
    } }),
    customer: await tx.customer.findUnique({ where: { id: scope.subjectId } }),
    orders: await tx.order.findMany({ where: { OR: [{ customerId: scope.subjectId }, { id: { in: ids } }] },
      orderBy: { id: "asc" }, include: { items: { orderBy: { id: "asc" } }, digitalReceipt: true, helpRequest: true } }),
    access: await tx.privacyAccessCredential.findMany({ where: { customerId: scope.subjectId }, orderBy: { id: "asc" } }),
    challenges: await tx.privacyChallenge.findMany({ where: { OR: [{ subjectId: scope.subjectId },
      { phoneHash: scope.phoneHash }, { sourceOrderId: { in: ids } }] }, orderBy: { id: "asc" } }),
    marker: await tx.privacyDeletedIdentity.findUnique({ where: { phoneHash: scope.phoneHash } }),
    retention: await tx.retentionMessage.findMany({ where: { customerId: scope.subjectId }, orderBy: { id: "asc" } }),
    dispatch: await tx.dispatchEvent.findMany({ where: { orderId: { in: ids } }, orderBy: { id: "asc" } }),
    editPauses: await tx.orderEditPause.findMany({ where: { orderId: { in: ids } }, orderBy: { id: "asc" } }),
    pickupStops: await tx.orderPickupStop.findMany({ where: { orderId: { in: ids } }, orderBy: { id: "asc" } }),
    checkIns: await tx.deliveryCheckInEvent.findMany({ where: { orderId: { in: ids } }, orderBy: { id: "asc" } })
  };
  return journal.evidenceDigest(values);
}
