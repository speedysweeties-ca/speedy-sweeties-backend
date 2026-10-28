import { Prisma } from "@prisma/client";
import { PrivacyDeletionService, digest, privacyLock, retainedFinancialFields } from "./privacyDeletion.service";
import { canonical, RecoveryError } from "./privacyRecoveryJournal";
import { customerIdentity, financialEvidence, hydrateState, orderIdentity, type RecoveryState } from "./privacyRecoveryState";

// No HTTP route, startup hook, remote-store configuration or production CLI. This
// entry point is intentionally constrained to the existing synthetic CI facility.
// A production target adapter requires separate exact-resource/offline approval.
export async function reconcileSyntheticRestore(service: PrivacyDeletionService, databaseUrl: string, digestKey: string) {
  const url = new URL(databaseUrl);
  if (process.env.NODE_ENV !== "test" || process.env.PRIVACY_SYNTHETIC_DATABASE !== "yes" ||
      !["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/speedy_privacy_synthetic" || url.username !== "privacy_test")
    throw new RecoveryError("RECOVERY_TARGET_REJECTED");
  const db = service.db;
  const identity = await db.$queryRaw<{ name: string; owner: string }[]>`SELECT current_database() AS name, current_user AS owner`;
  if (identity[0]?.name !== "speedy_privacy_synthetic" || identity[0]?.owner !== "privacy_test") throw new RecoveryError("RECOVERY_TARGET_REJECTED");
  const guards = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_trigger WHERE NOT tgisinternal
    AND tgenabled = 'O' AND tgname IN ('privacy_retained_order_guard', 'privacy_receipt_guard', 'privacy_item_guard', 'privacy_help_guard')`;
  if (guards[0]?.count !== 4) throw new RecoveryError("RECOVERY_SCHEMA_REQUIRED");
  if (!service.recovery || service.hash("key-check") !== new PrivacyDeletionService(db, digestKey, {} as any, () => false, "recovery", "12-31").hash("key-check"))
    throw new RecoveryError("RECOVERY_KEY_MISMATCH");
  const history = await service.recovery.ready();
  const states = [...history.cases.values()].map(s => hydrateState(s as RecoveryState));
  return db.$transaction(async tx => {
    await privacyLock(tx);
    const known = new Set(states.map(s => s.request.id));
    for (const r of await tx.privacyDeletionRequest.findMany({ select: { id: true } }))
      if (!known.has(r.id)) throw new RecoveryError("RECOVERY_UNRECORDED_DECISION");
    if (await tx.privacyDeletedIdentity.count({ where: { keyFingerprint: { not: digest(digestKey) } } })) throw new RecoveryError("RECOVERY_KEY_MISMATCH");
    let erased = 0, preserved = 0;
    for (const state of states) {
      const r = state.request;
      const current = await tx.privacyDeletionRequest.findUnique({ where: { id: r.id } });
      if (current && (current.version > r.version || current.updatedAt > r.updatedAt)) throw new RecoveryError("RECOVERY_NEWER_DATABASE_DECISION");
      if (current && ["CANCELLED", "HOLD"].includes(current.status) && r.databaseErasedAt) throw new RecoveryError("RECOVERY_DATABASE_HOLD_OR_CANCELLATION");
      for (const task of await tx.privacyExternalTask.findMany({ where: { requestId: r.id } })) {
        const recorded = state.tasks.find(t => t.system === task.system);
        // External outcomes do not advance the parent request's updatedAt/version.
        // Never overwrite an unrecorded or newer retention/review decision.
        if (!recorded ||
            (task.reviewedAt && (!recorded.reviewedAt || task.reviewedAt > recorded.reviewedAt)) ||
            (task.retainUntil && (!recorded.retainUntil || task.retainUntil > recorded.retainUntil)))
          throw new RecoveryError("RECOVERY_NEWER_EXTERNAL_DECISION");
      }
      const customer = await tx.customer.findUnique({ where: { id: state.scope.subjectId } });
      const orders = await tx.order.findMany({ where: { id: { in: state.scope.orders.map(o => o.id) } }, include: { items: true, digitalReceipt: true } });
      // A snapshot may predate a later transaction, or a retained record may be
      // missing. A minimized checkpoint cannot recreate that financial evidence.
      if (orders.length !== state.scope.orders.length) throw new RecoveryError("RECOVERY_FINANCIAL_SCOPE_INCOMPLETE");
      if (customer && service.hash(customerIdentity(customer)) !== state.scope.ownerHash) throw new RecoveryError("RECOVERY_OWNERSHIP_CHANGED");
      const ids = orders.map(o => o.id);
      if (await tx.order.count({ where: { customerId: state.scope.subjectId, id: { notIn: state.scope.orders.map(o => o.id) } } }))
        throw new RecoveryError("RECOVERY_SCOPE_CHANGED");
      for (const o of orders) {
        const bound = state.scope.orders.find(b => b.id === o.id)!;
        if (service.hash(financialEvidence(o)) !== bound.financialHash) throw new RecoveryError("RECOVERY_FINANCIAL_EVIDENCE_CHANGED");
        if (!o.privacyErasedAt && (o.customerId !== state.scope.subjectId || service.hash(orderIdentity(o)) !== bound.identityHash))
          throw new RecoveryError("RECOVERY_OWNERSHIP_CHANGED");
        if (o.privacyRetainUntil && state.decision && o.privacyRetainUntil > new Date(state.decision.financialRetainUntil))
          throw new RecoveryError("RECOVERY_NEWER_FINANCIAL_HOLD");
      }
      if (!r.databaseErasedAt) {
        // A request, newer cancellation or HOLD is not an erasure instruction.
        const laterErasure = r.status === "CANCELLED" && states.some(s => s.scope.subjectId === state.scope.subjectId &&
          s.request.databaseErasedAt && r.closedAt && s.request.databaseErasedAt >= r.closedAt);
        if ((!customer || orders.some(o => o.privacyErasedAt)) && !laterErasure) throw new RecoveryError("RECOVERY_NON_ERASURE_CONFLICT");
        preserved++;
      } else {
        if (!state.decision || !state.marker || state.marker.keyFingerprint !== digest(digestKey) ||
            ["CANCELLED", "HOLD"].includes(r.status)) throw new RecoveryError("RECOVERY_DECISION_INVALID");
        const priorMarker = await tx.privacyDeletedIdentity.findUnique({ where: { phoneHash: state.scope.phoneHash } });
        if (priorMarker && (priorMarker.createdAt.getTime() !== state.marker.createdAt.getTime() || priorMarker.reviewAt > state.marker.reviewAt))
          throw new RecoveryError("RECOVERY_NEWER_MARKER_REVIEW");
        if (customer) {
          if (orders.some(o => o.privacyErasedAt) || !ids.includes(r.sourceOrderId)) throw new RecoveryError("RECOVERY_PARTIAL_SCOPE_REQUIRES_REVIEW");
          // Install only a temporary pre-erasure request. Never import terminal
          // flags and call fulfill(): its idempotent early return is inapplicable.
          const pending: Prisma.PrivacyDeletionRequestUncheckedCreateInput = { ...r, subjectId: state.scope.subjectId, activeSubject: state.scope.subjectId,
            contactFingerprint: service.fingerprint(customer), databaseErasedAt: null,
            completedAt: null, status: "SUBMITTED", decision: Prisma.DbNull, summary: null };
          await tx.privacyDeletionRequest.upsert({ where: { id: r.id }, create: pending, update: pending });
          const p = await service.preview(tx, r.id);
          if (p.activeOrders.length || p.unlinkedOrderIds.length || p.conflictingLinkedOrderIds.length) throw new RecoveryError("RECOVERY_SCOPE_REQUIRES_REVIEW");
          // Existing external tasks may exist in a partially restored case. Preserve
          // their historical outcome below, after the shared erasure routine.
          await tx.privacyExternalTask.deleteMany({ where: { requestId: r.id } });
          await service.eraseScoped(tx, p, { ...state.decision, justification: "Replay of independently recorded approved financial-retention decision.",
            personalFields: [], financialFields: [...retainedFinancialFields], unlinkedRecordsReviewed: true, confirmed: true }, r.databaseErasedAt, "offline-recovery");
          erased++;
        } else if (orders.some(o => !o.privacyErasedAt)) throw new RecoveryError("RECOVERY_ORPHANED_SCOPE");
        await tx.privacyDeletedIdentity.upsert({ where: { phoneHash: state.scope.phoneHash }, create: state.marker, update: state.marker });
      }
      const final: Prisma.PrivacyDeletionRequestUncheckedCreateInput = { ...r, decision: state.decision ? { ...state.decision, personalFields: [], financialFields: [...retainedFinancialFields] } : Prisma.DbNull,
        summary: r.databaseErasedAt ? "Historical deletion decision reconciled from protected history. Financial evidence retained; external outcomes require operator verification before reopening." : null };
      await tx.privacyDeletionRequest.upsert({ where: { id: r.id }, create: final, update: final });
      for (const task of state.tasks) {
        const data = { system: task.system, status: task.status, retainUntil: task.retainUntil, reviewedAt: task.reviewedAt,
          evidence: task.evidenceHash ? `recovery-evidence-sha256:${task.evidenceHash}` : null };
        await tx.privacyExternalTask.upsert({ where: { requestId_system: { requestId: r.id, system: task.system } }, create: { ...data, requestId: r.id }, update: data });
      }
    }
    // Require the independently protected history not to advance during the offline
    // transaction. A failed/racing replay rolls back every database change.
    if (canonical((await service.recovery!.ready()).head) !== canonical(history.head)) throw new RecoveryError("RECOVERY_HISTORY_ADVANCED");
    return { cases: states.length, erased, preserved, databaseReconciled: true, trafficMayReopen: false };
  }, { timeout: 15000 });
}
