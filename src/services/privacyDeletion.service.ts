import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma, PrismaClient, Customer } from "@prisma/client";
import { z } from "zod";

export class PrivacyError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const secureEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const phoneDigits = (value: string) => value.replace(/\D/g, "");
const closed = ["DELIVERED", "CANCELLED"];
const cancellable = ["SUBMITTED", "REVIEWING", "HOLD"];
export const externalSystems = ["phones_and_synced_contacts", "messages_and_email", "staff_notes_and_exports", "logs_and_providers", "backups_and_restore"] as const;
export const retainedFinancialFields = ["recordIds", "orderNumber", "createdAt", "updatedAt", "paymentMethod", "orderStatus", "quantity", "price", "receiptNumber", "itemTotal", "deliveryCharge", "taxOrFees", "grandTotal"] as const;
const future = z.string().datetime().refine(v => new Date(v).getTime() > Date.now(), "A future date is required");
export const retentionDecisionSchema = z.object({
  policyReference: z.string().trim().min(8).max(200),
  justification: z.string().trim().min(12).max(600),
  financialRetainUntil: future,
  requestRetainUntil: future,
  suppressionReviewAt: future,
  personalFields: z.array(z.string()).length(0),
  financialFields: z.array(z.enum(retainedFinancialFields)).refine(v =>
    v.length === retainedFinancialFields.length && new Set(v).size === retainedFinancialFields.length),
  unlinkedRecordsReviewed: z.literal(true),
  confirmed: z.literal(true)
}).strict();
export type RetentionDecision = z.infer<typeof retentionDecisionSchema>;
export type Delivery = (message: { to: string; code: string; id: string }) => Promise<void>;
type Tx = Prisma.TransactionClient;
export async function privacyLock(tx: Tx) {
  // Shared with all order creation/update paths: no profile resurrection race.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(2601022)`;
}

export class PrivacyDeletionService {
  constructor(readonly db: PrismaClient, private key: string, private deliver: Delivery,
    private canFulfill: (decision?: RetentionDecision) => boolean = () => false) {
    if (key.length < 16) throw new Error("Privacy digest key is not configured");
  }
  hash(value: string) { return createHmac("sha256", this.key).update(`privacy-v1:${value}`).digest("hex"); }
  fingerprint(c: Customer) { return this.hash(JSON.stringify([c.id, c.normalizedPhone, c.normalizedEmail, c.privacyVerifiedEmail, c.privacyVerifiedEmailAt])); }
  private async eligibleContact(tx: Tx, customer: Customer) {
    return !!customer.privacyVerifiedEmailAt && !!customer.privacyVerifiedEmail &&
      customer.privacyVerifiedEmail.toLowerCase() === customer.normalizedEmail &&
      await tx.customer.count({ where: { normalizedEmail: customer.normalizedEmail } }) === 1 &&
      await tx.customer.count({ where: { normalizedPhone: customer.normalizedPhone } }) === 1;
  }
  async atomic<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.db.$transaction(async tx => { await privacyLock(tx); return work(tx); }, { timeout: 15000 }); }
      catch (e) { if (attempt >= 2 || !(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2034") throw e; }
    }
  }
  async challenge(phone: string, requester: string) {
    const id = randomUUID(), code = String(randomInt(10000000, 100000000));
    const phoneHash = this.hash(`phone:${phoneDigits(phone)}`), requesterHash = this.hash(`ip:${requester}`);
    const target = await this.atomic(async tx => {
      const since = new Date(Date.now() - 3600000);
      const attempts = await tx.privacyChallenge.count({ where: { createdAt: { gte: since }, OR: [{ phoneHash }, { requesterHash }] } });
      if (attempts >= 5) throw new PrivacyError(429, "TRY_LATER");
      const matches = await tx.customer.findMany({ where: { normalizedPhone: phoneDigits(phone) }, take: 2 });
      let customer = matches.length === 1 ? matches[0] : null;
      // Existing, independently verified, unique email only. Public order email is NOT proof.
      if (customer && !await this.eligibleContact(tx, customer)) customer = null;
      await tx.privacyChallenge.create({ data: { id, subjectId: customer?.id,
        contactFingerprint: customer ? this.fingerprint(customer) : null, phoneHash, requesterHash,
        codeHash: this.hash(`${id}:${code}`), expiresAt: new Date(Date.now() + 10 * 60000) } });
      return customer?.privacyVerifiedEmail;
    });
    if (target) {
      try {
        await this.deliver({ to: target, code, id });
        await this.db.privacyChallenge.update({ where: { id }, data: { delivery: "SENT" } });
      } catch { /* No recipient, provider response, OTP or secret in logs. New challenge is safe to retry. */ }
    }
    // Same response whether absent, ambiguous, delivery failed or sent; no masked address enumeration.
    return { challengeId: id, message: "If an eligible existing contact is available, a code will be sent there. No account has been deleted. If no code arrives, verification may not yet be available for your account." };
  }
  async verify(id: string, code: string) {
    const valid = await this.atomic(async tx => {
      const c = await tx.privacyChallenge.findUnique({ where: { id } });
      if (!c || c.expiresAt <= new Date() || c.consumedAt || c.attempts >= 5) return false;
      // Commit failed attempts, rather than throwing and rolling back the attempt counter.
      await tx.privacyChallenge.update({ where: { id }, data: { attempts: { increment: 1 } } });
      const customer = c.subjectId && await tx.customer.findUnique({ where: { id: c.subjectId } });
      if (c.delivery !== "SENT" || !customer || this.fingerprint(customer) !== c.contactFingerprint ||
          !await this.eligibleContact(tx, customer) ||
          !secureEqual(c.codeHash, this.hash(`${id}:${code}`))) return false;
      await tx.privacyChallenge.update({ where: { id }, data: { verifiedAt: new Date() } });
      return true;
    });
    if (!valid) throw new PrivacyError(400, "INVALID_OR_EXPIRED_CODE");
    return { proof: this.hash(`proof:${id}`) };
  }
  async submit(input: { id: string; token: string; challengeId: string; proof: string }) {
    return this.atomic(async tx => {
      const existing = await tx.privacyDeletionRequest.findUnique({ where: { id: input.id } });
      if (existing) {
        this.authorize(existing.tokenHash, input.token);
        return this.publicStatus(existing);
      }
      const c = await tx.privacyChallenge.findUnique({ where: { id: input.challengeId } });
      const customer = c?.subjectId && await tx.customer.findUnique({ where: { id: c.subjectId } });
      if (!c || !c.verifiedAt || c.consumedAt || c.expiresAt <= new Date() || !customer ||
          c.contactFingerprint !== this.fingerprint(customer) || !await this.eligibleContact(tx, customer) ||
          !secureEqual(this.hash(`proof:${c.id}`), input.proof))
        throw new PrivacyError(401, "VERIFICATION_REQUIRED");
      if (await tx.privacyDeletionRequest.findUnique({ where: { activeSubject: customer.id } }))
        throw new PrivacyError(409, "REQUEST_ALREADY_OPEN");
      await tx.privacyChallenge.update({ where: { id: c.id }, data: { consumedAt: new Date() } });
      const request = await tx.privacyDeletionRequest.create({ data: {
        id: input.id, tokenHash: digest(input.token), challengeId: c.id, subjectId: customer.id,
        activeSubject: customer.id, contactFingerprint: this.fingerprint(customer),
        audit: { create: { actorId: "customer", event: "SUBMITTED" } }
      } });
      return this.publicStatus(request);
    });
  }
  authorize(expected: string, token: string) { if (!secureEqual(expected, digest(token))) throw new PrivacyError(404, "REQUEST_UNAVAILABLE"); }
  publicStatus(r: { id: string; status: string; version: number; summary: string | null }) {
    return { id: r.id, status: r.status, version: r.version, canCancel: cancellable.includes(r.status),
      message: r.status === "COMPLETED" ? "Deletion completed for eligible records. Retention details are below." :
        r.status === "CANCELLED" ? "Request cancelled. Your account was not deleted by this request." :
        r.status === "FULFILLING" ? "Fulfillment has started. Required external-system checks are still pending; deletion is not complete." :
        "Request received. Your account has not been deleted. We will review identity, active deliveries and required retention.",
      retentionSummary: r.summary };
  }
  async status(id: string, token: string) {
    const r = await this.db.privacyDeletionRequest.findUnique({ where: { id } });
    if (!r) throw new PrivacyError(404, "REQUEST_UNAVAILABLE");
    this.authorize(r.tokenHash, token); return this.publicStatus(r);
  }
  async cancel(id: string, token: string) {
    return this.atomic(async tx => {
      const r = await tx.privacyDeletionRequest.findUnique({ where: { id } });
      if (!r) throw new PrivacyError(404, "REQUEST_UNAVAILABLE");
      this.authorize(r.tokenHash, token);
      if (r.status === "CANCELLED") return this.publicStatus(r);
      if (!cancellable.includes(r.status)) throw new PrivacyError(409, "FULFILLMENT_ALREADY_STARTED");
      return this.publicStatus(await tx.privacyDeletionRequest.update({ where: { id }, data: {
        status: "CANCELLED", activeSubject: null, version: { increment: 1 },
        audit: { create: { actorId: "customer", event: "CANCELLED" } }
      } }));
    });
  }
  async preview(tx: Tx, id: string) {
    const r = await tx.privacyDeletionRequest.findUniqueOrThrow({ where: { id } });
    if (r.subjectId) await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${r.subjectId} FOR UPDATE`;
    const customer = r.subjectId && await tx.customer.findUnique({ where: { id: r.subjectId } });
    if (!customer) throw new PrivacyError(409, "SUBJECT_UNAVAILABLE");
    if (this.fingerprint(customer) !== r.contactFingerprint) throw new PrivacyError(409, "CONTACT_CHANGED_REVERIFY");
    if (!await this.eligibleContact(tx, customer)) throw new PrivacyError(409, "CONTACT_CHANGED_REVERIFY");
    const orders = await tx.order.findMany({ where: { customerId: customer.id }, orderBy: { id: "asc" }, include: { items: true, digitalReceipt: true, helpRequest: true } });
    // Detached historical orders are deliberately flagged for human identity review, not swept by a phone/email guess.
    const unlinked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Order" WHERE "customerId" IS NULL AND "privacyErasedAt" IS NULL AND regexp_replace(phone, '[^0-9]', '', 'g') = ${customer.normalizedPhone}`;
    const hash = digest(JSON.stringify({ customer, orders, unlinked }));
    return { request: r, customer, orders, hash, activeOrders: orders.filter(o => !closed.includes(o.orderStatus)).map(o => o.id), unlinkedOrderIds: unlinked.map(o => o.id) };
  }
  async impact(id: string) {
    return this.atomic(async tx => {
      const p = await this.preview(tx, id);
      return { id, version: p.request.version, previewHash: p.hash, orderCount: p.orders.length,
        activeOrders: p.activeOrders, unlinkedOrderIds: p.unlinkedOrderIds,
        financialFields: retainedFinancialFields, externalSystems,
        removes: "Customer profile; copied order contact/address/geocode/notes; receipt notes; help messages; retention drafts; order push/tracking credentials; dispatch and pickup history. Item text and catalog links are redacted; quantities and financial amounts remain." };
    });
  }
  async fulfill(id: string, actor: string, version: number, previewHash: string, rawDecision: unknown) {
    const parsed = retentionDecisionSchema.safeParse(rawDecision);
    if (!parsed.success) throw new PrivacyError(400, "VALIDATED_RETENTION_DECISION_REQUIRED");
    const decision = parsed.data;
    if (!this.canFulfill(decision)) throw new PrivacyError(503, "FULFILLMENT_DISABLED");
    return this.atomic(async tx => {
      const r = await tx.privacyDeletionRequest.findUniqueOrThrow({ where: { id } });
      // Retry after a lost successful response cannot run deletion twice.
      if (r.databaseErasedAt) return this.publicStatus(r);
      if (!cancellable.includes(r.status) || r.version !== version) throw new PrivacyError(409, "STALE_REQUEST");
      const p = await this.preview(tx, id);
      if (p.hash !== previewHash) throw new PrivacyError(409, "STALE_PREVIEW");
      if (p.activeOrders.length) throw new PrivacyError(409, "ACTIVE_ORDERS_HOLD");
      if (p.unlinkedOrderIds.length) throw new PrivacyError(409, "UNLINKED_RECORDS_REQUIRE_REVIEW");
      const now = new Date(), ids = p.orders.map(o => o.id);
      await tx.orderItem.updateMany({ where: { orderId: { in: ids } }, data: { name: "Redacted item description", itemCatalogId: null } });
      await tx.digitalReceipt.updateMany({ where: { orderId: { in: ids } }, data: { notes: null, createdByDriverId: null } });
      await tx.dispatchEvent.deleteMany({ where: { orderId: { in: ids } } });
      await tx.orderEditPause.deleteMany({ where: { orderId: { in: ids } } });
      await tx.orderPickupStop.deleteMany({ where: { orderId: { in: ids } } });
      await tx.order.updateMany({ where: { id: { in: ids } }, data: {
        privacyErasedAt: now, privacyRetainUntil: new Date(decision.financialRetainUntil), customerId: null, customerName: "Deleted customer", phone: "", email: "",
        addressLine1: "", unitNumber: null, buzzCode: null, city: "", province: "", postalCode: null,
        itemsText: "", additionalNotes: null, cancellationReason: null, fcmToken: null,
        trackingTokenHash: null, trackingTokenExpiresAt: null,
        deliveryLatitude: null, deliveryLongitude: null, geocodeStatus: null, geocodedAddress: null,
        geocodePlaceId: null, geocodeAddressFingerprint: null,
        utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null, referralCode: null,
        assignedDriverId: null, assignedAt: null, createdByUserId: null, dispatchedByUserId: null,
        manualEntryStartedAt: null, dispatchedAt: null, dispatchSource: null, acceptedAt: null,
        outForDeliveryAt: null, deliveredAt: null, cancelledAt: null, cancelledFromStatus: null,
        undispatchedAlertClaimedAt: null, undispatchedAlertSentAt: null, orderSource: "UNKNOWN", priority: "NORMAL"
      } });
      await tx.deliveryHelpRequest.deleteMany({ where: { orderId: { in: ids } } });
      await tx.deliveryCheckInEvent.deleteMany({ where: { orderId: { in: ids } } });
      await tx.privacyDeletedIdentity.upsert({ where: { phoneHash: this.hash(`phone:${p.customer.normalizedPhone}`) },
        create: { phoneHash: this.hash(`phone:${p.customer.normalizedPhone}`), keyFingerprint: digest(this.key), reviewAt: new Date(decision.suppressionReviewAt) },
        update: { reviewAt: new Date(decision.suppressionReviewAt) } });
      // Cascade removes RetentionMessage, but all independent order snapshots were handled above.
      await tx.customer.delete({ where: { id: p.customer.id } });
      await tx.privacyChallenge.updateMany({ where: { subjectId: p.customer.id }, data: { subjectId: null, contactFingerprint: null, codeHash: "revoked", consumedAt: now } });
      return this.publicStatus(await tx.privacyDeletionRequest.update({ where: { id }, data: {
        subjectId: null, activeSubject: null, contactFingerprint: "revoked", databaseErasedAt: now,
        status: "FULFILLING", version: { increment: 1 }, decision,
        summary: `Financial fields retained: ${decision.financialFields.join(", ")}. Basis: ${decision.justification}. Retain until ${decision.financialRetainUntil}. Request evidence retained until ${decision.requestRetainUntil}. Anti-recreation identifier review: ${decision.suppressionReviewAt}. External-system checks pending.`,
        tasks: { create: externalSystems.map(system => ({ system })) },
        audit: { create: { actorId: actor, event: "DATABASE_ERASED_EXTERNAL_PENDING" } }
      } }));
    });
  }
  async resolveExternal(id: string, actor: string, system: string, evidence: string, retainUntil?: string) {
    if (!externalSystems.includes(system as typeof externalSystems[number]) || evidence.trim().length < 12 || evidence.length > 600 ||
        (retainUntil && !future.safeParse(retainUntil).success)) throw new PrivacyError(400, "EVIDENCE_REQUIRED");
    return this.atomic(async tx => {
      const r = await tx.privacyDeletionRequest.findUniqueOrThrow({ where: { id } });
      if (r.status !== "FULFILLING") throw new PrivacyError(409, "INVALID_STATE");
      const existing = await tx.privacyExternalTask.findUniqueOrThrow({ where: { requestId_system: { requestId: id, system } } });
      const outcome = retainUntil ? "RETAINED_WITH_EXPIRY" : "RESOLVED";
      const recordedEvidence = retainUntil ? `${evidence} Retain until ${retainUntil}` : evidence;
      if (existing.status !== "PENDING") {
        if (existing.status === outcome && existing.evidence === recordedEvidence) return { success: true };
        throw new PrivacyError(409, "EVIDENCE_ALREADY_RECORDED");
      }
      await tx.privacyExternalTask.update({ where: { requestId_system: { requestId: id, system } }, data: {
        status: outcome, evidence: recordedEvidence
      } });
      await tx.privacyAudit.create({ data: { requestId: id, actorId: actor, event: `EXTERNAL_RESOLVED:${system}` } });
      return { success: true };
    });
  }
  async complete(id: string, actor: string) {
    return this.atomic(async tx => {
      const r = await tx.privacyDeletionRequest.findUniqueOrThrow({ where: { id }, include: { tasks: true } });
      if (r.status === "COMPLETED") return this.publicStatus(r);
      if (r.status !== "FULFILLING" || r.tasks.length !== externalSystems.length || r.tasks.some(t => t.status === "PENDING"))
        throw new PrivacyError(409, "EXTERNAL_WORK_INCOMPLETE");
      return this.publicStatus(await tx.privacyDeletionRequest.update({ where: { id }, data: {
        status: "COMPLETED", completedAt: new Date(), version: { increment: 1 },
        summary: `${r.summary?.replace("External-system checks pending.", "External-system checks recorded.")} ${r.tasks.filter(t => t.status === "RETAINED_WITH_EXPIRY").map(t => `${t.system}: ${t.evidence}`).join(" ")}`,
        audit: { create: { actorId: actor, event: "COMPLETED_CUSTOMER_STATUS_AVAILABLE" } }
      } }));
    });
  }
}
