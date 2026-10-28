import type { Prisma, PrivacyDeletionRequest } from "@prisma/client";
import { canonical, RecoveryError } from "./privacyRecoveryJournal";

export type RecoveryScope = {
  subjectId: string; contactFingerprint: string; ownerHash: string; phoneHash: string;
  orders: { id: string; identityHash: string; financialHash: string }[];
};
export type RecoveryState = {
  // Only allowlisted fields are copied. No customer contacts, raw credentials,
  // challenge codes, actor notes, provider references or receipt originals.
  request: Omit<PrivacyDeletionRequest, "decision" | "summary">;
  decision: { policyReference: string; taxYearEnd: string; financialRetainUntil: string; justificationHash: string } | null;
  scope: RecoveryScope;
  marker: { phoneHash: string; keyFingerprint: string; createdAt: Date; reviewAt: Date } | null;
  tasks: { system: string; status: string; evidenceHash: string | null; retainUntil: Date | null; reviewedAt: Date | null }[];
};
export const chargeEvidence = (receipt: any) => {
  if (receipt.retainedChargeEvidence) return receipt.retainedChargeEvidence;
  const notes: string = receipt.notes || "";
  const count = notes.match(/Extra stops:\s*([0-9]+)/i)?.[1];
  const extra = notes.match(/Extra stop charge:\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)?.[1];
  const distance = notes.match(/Distance surcharge:\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)?.[1];
  return count || extra || distance ? { ...(count ? { extraStops: Number(count) } : {}),
    ...(extra ? { extraStopCharge: extra } : {}), ...(distance ? { distanceSurcharge: distance } : {}) } : null;
};
export const orderIdentity = (o: any) => canonical([o.customerName.trim().toLowerCase(), o.phone.replace(/\D/g, ""), o.email.trim().toLowerCase()]);
export const customerIdentity = (c: any) => canonical([c.id, c.normalizedFullName, c.normalizedPhone, c.normalizedEmail]);
export const financialEvidence = (o: any) => canonical({
  id: o.id, number: o.orderNumber, createdAt: o.createdAt, payment: o.paymentMethod, status: o.orderStatus,
  items: o.items.map((i: any) => ({ id: i.id, name: i.name, quantity: i.quantity, price: String(i.price) })).sort((a: any, b: any) => a.id.localeCompare(b.id)),
  receipt: !o.digitalReceipt ? null : { id: o.digitalReceipt.id, number: o.digitalReceipt.receiptNumber,
    createdAt: o.digitalReceipt.createdAt, items: String(o.digitalReceipt.itemTotal), delivery: String(o.digitalReceipt.deliveryCharge),
    tax: String(o.digitalReceipt.taxOrFees), total: String(o.digitalReceipt.grandTotal), charges: chargeEvidence(o.digitalReceipt) }
});
export async function recoveryState(tx: Prisma.TransactionClient, id: string, hash: (s: string) => string,
  fingerprint: (c: any) => string, prior?: RecoveryScope): Promise<RecoveryState | null> {
  const r = await tx.privacyDeletionRequest.findUnique({ where: { id }, include: { tasks: true } });
  if (!r) return null;
  let scope = prior;
  if (r.subjectId) {
    const c = await tx.customer.findUnique({ where: { id: r.subjectId } });
    if (!c) throw new RecoveryError("RECOVERY_SUBJECT_UNAVAILABLE");
    const orders = await tx.order.findMany({ where: { customerId: c.id }, include: { items: true, digitalReceipt: true }, orderBy: { id: "asc" } });
    scope = { subjectId: c.id, contactFingerprint: fingerprint(c), ownerHash: hash(customerIdentity(c)), phoneHash: hash(`phone:${c.normalizedPhone}`),
      orders: orders.map(o => ({ id: o.id, identityHash: hash(orderIdentity(o)), financialHash: hash(financialEvidence(o)) })) };
  }
  if (!scope) throw new RecoveryError("RECOVERY_SCOPE_REQUIRED");
  const { tasks, decision, summary: _summary, ...request } = r;
  const d = decision as Record<string, string> | null;
  return { request, scope, marker: await tx.privacyDeletedIdentity.findUnique({ where: { phoneHash: scope.phoneHash } }),
    decision: d ? { policyReference: d.policyReference, taxYearEnd: d.taxYearEnd,
    financialRetainUntil: d.financialRetainUntil, justificationHash: d.justificationHash || hash(d.justification) } : null,
    tasks: tasks.map(t => ({ system: t.system, status: t.status, evidenceHash: t.evidence ?
      (/^recovery-evidence-sha256:[a-f0-9]{64}$/.test(t.evidence) ? t.evidence.slice(25) : hash(t.evidence)) : null,
      retainUntil: t.retainUntil, reviewedAt: t.reviewedAt })) };
}
export function hydrateState(value: RecoveryState): RecoveryState {
  // Store implementations must round-trip JSON, not depend on in-process Date objects.
  const r = { ...value.request };
  for (const k of ["createdAt", "updatedAt", "dueAt", "databaseErasedAt", "completedAt", "closedAt", "requestAuditReviewAt"] as const) {
    if (r[k] != null) (r as any)[k] = new Date(r[k]!);
  }
  return { ...value, request: r, marker: value.marker ? { ...value.marker, createdAt: new Date(value.marker.createdAt), reviewAt: new Date(value.marker.reviewAt) } : null,
    tasks: value.tasks.map(t => ({ ...t,
    retainUntil: t.retainUntil ? new Date(t.retainUntil) : null, reviewedAt: t.reviewedAt ? new Date(t.reviewedAt) : null })) };
}
