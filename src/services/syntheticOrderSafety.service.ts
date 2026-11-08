import { createHmac } from "node:crypto";
import { OrderStatus } from "@prisma/client";
import { ApiError } from "../utils/ApiError";

// Operator-enrolled synthetic data only. These fingerprints are NOT credentials
// or ownership attestations. Normal tracking/loyalty/email guards still apply.
export const SYNTHETIC_ORDER_POLICY_KEY = "syntheticOrderSafety.v1";
export const SYNTHETIC_CANCELLATION_REASON = "Synthetic test order: no purchase or delivery; automatically cancelled.";
export type SyntheticProfile = {
  customerName: string; customerPhone: string; customerEmail: string;
  addressLine1: string; city: string; province: string;
  unitNumber?: string | null; buzzCode?: string | null;
};
type Db = any;
export type SyntheticEnrollmentConflict =
  "ENROLLMENT_PRECONDITION" | "EXISTING_POLICY" | "EXPIRY_ELAPSED" | "PROFILE_COLLISION";
export type SyntheticEnrollmentInput = {
  profile: SyntheticProfile; ownerConfirmedSynthetic: boolean; expiresAt: string;
  maxOrders: number; maxEmails: number;
};
export type SyntheticPolicy = {
  version: 1; state: "ACTIVE" | "CLOSED"; expiresAt: string;
  maxOrders: number; ordersCreated: number; maxEmails: number; emailsClaimed: number;
  profileHash: string; phoneHash: string; emailHash: string;
  keyFingerprint: string; customerId: string | null;
};
const stop = (status = 409) => new ApiError(status,
  "Synthetic test safety is unavailable or the enrolled profile does not match. Stop and contact dispatch.");
const enrollmentStop = (code: SyntheticEnrollmentConflict) => new ApiError(409,
  "Synthetic reviewer enrollment was refused. Stop and review the safe refusal category.", { code });
const text = (v: unknown) => typeof v === "string" ? v.trim().toLowerCase().replace(/\s+/g, " ") : "";
function h(value: string, key = process.env.PRIVACY_DIGEST_KEY || "") {
  if (key.length < 32) throw stop(503);
  return createHmac("sha256", key).update("synthetic-order-safety-v1:" + value).digest("hex");
}
export function profileFingerprints(p: SyntheticProfile) {
  if (!p || ![p.customerName, p.customerPhone, p.customerEmail, p.addressLine1, p.city, p.province]
    .every(x => typeof x === "string" && x.length <= 500)) throw stop();
  const phone = p.customerPhone.replace(/\D/g, "");
  if (!/^(?:1)?[2-9]\d{9}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(p.customerEmail)) ||
      !text(p.customerName) || !text(p.addressLine1) || text(p.city) !== "guelph" || text(p.province) !== "ontario" && text(p.province) !== "on") throw stop();
  const canonicalPhone = phone.length === 11 ? phone.slice(1) : phone;
  return { profileHash: h(JSON.stringify([text(p.customerName), canonicalPhone, text(p.customerEmail),
    text(p.addressLine1), text(p.unitNumber), text(p.buzzCode), "guelph", "on"])),
    phoneHash: h("phone:" + canonicalPhone), emailHash: h("email:" + text(p.customerEmail)), keyFingerprint: h("key-fingerprint") };
}
function parse(row: { value: string } | null | undefined): SyntheticPolicy | null {
  if (!row) return null;
  let p: SyntheticPolicy;
  try { p = JSON.parse(row.value); } catch { throw stop(503); }
  if (!p || typeof p !== "object" || p.version !== 1 || !["ACTIVE", "CLOSED"].includes(p.state) || !Number.isFinite(Date.parse(p.expiresAt)) ||
      ![p.profileHash, p.phoneHash, p.emailHash, p.keyFingerprint].every(x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x)) ||
      !Number.isInteger(p.maxOrders) || p.maxOrders < 1 || p.maxOrders > 6 ||
      !Number.isInteger(p.ordersCreated) || p.ordersCreated < 0 || p.ordersCreated > p.maxOrders ||
      !Number.isInteger(p.maxEmails) || p.maxEmails < 1 || p.maxEmails > 3 ||
      !Number.isInteger(p.emailsClaimed) || p.emailsClaimed < 0 || p.emailsClaimed > p.maxEmails ||
      !(p.customerId === null || typeof p.customerId === "string")) throw stop(503);
  if (p.keyFingerprint !== h("key-fingerprint")) throw stop(503);
  return p;
}
async function lockedPolicy(tx: Db) {
  // Enrollment, closing, order creation and message claims share this lock.
  // No timer/automatic reopening; CLOSED/expired profiles remain reserved.
  await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))::text", SYNTHETIC_ORDER_POLICY_KEY);
  return parse(await tx.systemSetting.findUnique({ where: { key: SYNTHETIC_ORDER_POLICY_KEY } }));
}
function classify(p: SyntheticPolicy | null, profile: SyntheticProfile, required: boolean, now: Date) {
  if (!p) { if (required) throw stop(); return null; }
  const phone = String(profile.customerPhone || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (p.phoneHash !== h("phone:" + phone) && p.emailHash !== h("email:" + text(profile.customerEmail))) { if (required) throw stop(); return null; }
  const f = profileFingerprints(profile);
  if (p.profileHash !== f.profileHash || p.state !== "ACTIVE" || Date.parse(p.expiresAt) <= now.getTime() || p.ordersCreated >= p.maxOrders) throw stop();
  return p;
}
export async function precheckSyntheticOrder(db: Db, profile: SyntheticProfile, required: boolean, now?: Date) {
  const p = parse(await db.systemSetting.findUnique({ where: { key: SYNTHETIC_ORDER_POLICY_KEY } }));
  return classify(p, profile, required, now ?? new Date());
}
export async function reserveSyntheticOrder(tx: Db, profile: SyntheticProfile, required: boolean, now?: Date) {
  // Evaluate the clock after waiting: a queued request has not reserved capacity.
  const p = classify(await lockedPolicy(tx), profile, required, now ?? new Date());
  if (!p) return null;
  const phone = profile.customerPhone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const matches = await tx.customer.findMany({ where: { OR: [
    { normalizedPhone: { in: [phone, "1" + phone] } }, { normalizedEmail: text(profile.customerEmail) }
  ] }, take: 2 });
  if (p.customerId === null ? matches.length !== 0 : matches.length !== 1 || matches[0].id !== p.customerId) throw stop();
  if (p.customerId) {
    const c = matches[0];
    const stored = profileFingerprints({ customerName: c.fullName, customerPhone: c.phone,
      customerEmail: c.email || "", addressLine1: c.addressLine1, city: c.city, province: c.province,
      unitNumber: c.unitNumber, buzzCode: c.buzzCode });
    if (stored.profileHash !== p.profileHash || !c.smsMarketingOptOut || c.loyaltyRewardBalance !== 0 ||
        c.loyaltyRewardsEarned !== 0 || c.loyaltyRewardsUsed !== 0 || c.loyaltyFreeDelivery || c.loyaltyCompletedOrders !== 0) throw stop();
    const orders = await tx.order.findMany({ where: { customerId: p.customerId }, take: p.maxOrders + 1,
      select: { id: true, orderStatus: true, assignedDriverId: true, cancellationReason: true, privacyErasedAt: true } });
    if (orders.length !== p.ordersCreated || orders.some((o: any) => o.orderStatus !== OrderStatus.CANCELLED ||
        o.assignedDriverId !== null || o.cancellationReason !== SYNTHETIC_CANCELLATION_REASON || o.privacyErasedAt)) throw stop();
  }
  return p;
}
export async function finishSyntheticOrder(tx: Db, p: SyntheticPolicy, customerId: string, orderId: string, now = new Date()) {
  // This runs before the order-creation transaction commits, before any dispatcher
  // or notification call. CANCELLED is terminal in the existing status machine.
  await tx.order.update({ where: { id: orderId }, data: { orderStatus: OrderStatus.CANCELLED,
    cancelledAt: now, cancelledFromStatus: OrderStatus.PLACED, cancellationReason: SYNTHETIC_CANCELLATION_REASON,
    assignedDriverId: null, assignedAt: null, fcmToken: null } });
  await tx.systemSetting.update({ where: { key: SYNTHETIC_ORDER_POLICY_KEY },
    data: { value: JSON.stringify({ ...p, customerId, ordersCreated: p.ordersCreated + 1 }) } });
}
export async function claimSyntheticEmail(tx: Db, customerId: string, channel: string, destination: string, now?: Date) {
  const p = await lockedPolicy(tx);
  if (!p || p.customerId !== customerId) return;
  if (p.state !== "ACTIVE" || Date.parse(p.expiresAt) <= (now ?? new Date()).getTime() || channel !== "EMAIL" || p.emailHash !== h("email:" + text(destination)) || p.emailsClaimed >= p.maxEmails) throw stop(429);
  // Claim is committed with the real challenge before a provider is called.
  // Failed/unknown deliveries consume the budget; there is no automatic resend.
  await tx.systemSetting.update({ where: { key: SYNTHETIC_ORDER_POLICY_KEY },
    data: { value: JSON.stringify({ ...p, emailsClaimed: p.emailsClaimed + 1 }) } });
}
// A protected source must never acquire a purchase/receipt through staff tooling.
export async function assertNoSyntheticReceipt(tx: Db, orderId: string) {
  const p = await lockedPolicy(tx);
  if (!p?.customerId) return;
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
  if (order?.customerId === p.customerId) throw stop();
}
export async function assertOrdinaryOrderContact(tx: Db, profile: SyntheticProfile) {
  // Empty-policy edits must serialize with enrollment too; otherwise both could
  // inspect an empty contact and then commit incompatible claims.
  if (classify(await lockedPolicy(tx), profile, false, new Date())) throw stop();
}
export async function assertNotSyntheticIntake(tx: Db, subjectId: string) {
  const p = await lockedPolicy(tx);
  // Reviewers are not personally recognized historical owners. Do not create a
  // synthetic D1–D3 attestation or use this exception as another delivery path.
  if (p?.customerId === subjectId) throw stop();
}
export function assertSyntheticOwner(actor: { userId?: string; role?: string } | undefined) {
  const allowed = (process.env.PRIVACY_ADMIN_USER_IDS || "").split(",").filter(Boolean);
  if (!actor || actor.role !== "ADMIN" || allowed.length !== 1 || allowed[0] !== actor.userId) throw new ApiError(403, "Owner administrator required.");
}
function validateEnrollmentInput(input: SyntheticEnrollmentInput, requestedAt: Date) {
  if (!input || input.ownerConfirmedSynthetic !== true || !input.profile ||
      text(input.profile.customerEmail) !== "speedysweeties@hotmail.com" || !Number.isInteger(input.maxOrders) || input.maxOrders < 1 || input.maxOrders > 6 ||
      !Number.isInteger(input.maxEmails) || input.maxEmails < 1 || input.maxEmails > 3 ||
      !Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= requestedAt.getTime() || Date.parse(input.expiresAt) > requestedAt.getTime() + 7 * 86400000) throw enrollmentStop("ENROLLMENT_PRECONDITION");
  try { return profileFingerprints(input.profile); }
  catch (error) {
    if (error instanceof ApiError && error.statusCode === 409) throw enrollmentStop("ENROLLMENT_PRECONDITION");
    throw error;
  }
}
async function assertEnrollmentAvailable(tx: Db, input: SyntheticEnrollmentInput, now?: Date) {
  if (await lockedPolicy(tx)) throw enrollmentStop("EXISTING_POLICY"); // Never replace/rearm a spent policy.
  if (Date.parse(input.expiresAt) <= (now ?? new Date()).getTime()) throw enrollmentStop("EXPIRY_ELAPSED");
  const phone = input.profile.customerPhone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (await tx.customer.count({ where: { OR: [{ normalizedPhone: { in: [phone, "1" + phone] } }, { normalizedEmail: text(input.profile.customerEmail) }] } })) {
    throw enrollmentStop("PROFILE_COLLISION");
  }
}
export async function validateSyntheticEnrollmentProfile(db: Db, actor: { userId?: string; role?: string } | undefined,
  input: SyntheticEnrollmentInput, now?: Date) {
  assertSyntheticOwner(actor);
  validateEnrollmentInput(input, now ?? new Date());
  return db.$transaction(async (tx: Db) => {
    await assertEnrollmentAvailable(tx, input, now);
    return { eligible: true as const };
  });
}
export async function enrollSyntheticProfile(db: Db, actor: { userId?: string; role?: string } | undefined,
  input: SyntheticEnrollmentInput, now?: Date) {
  assertSyntheticOwner(actor);
  const f = validateEnrollmentInput(input, now ?? new Date());
  return db.$transaction(async (tx: Db) => {
    // This repeats every availability check after browser validation. A customer
    // or policy created between the two requests must still stop enrollment.
    await assertEnrollmentAvailable(tx, input, now);
    const p: SyntheticPolicy = { version: 1, state: "ACTIVE", expiresAt: new Date(input.expiresAt).toISOString(),
      maxOrders: input.maxOrders, maxEmails: input.maxEmails, ordersCreated: 0, emailsClaimed: 0, customerId: null, ...f };
    await tx.systemSetting.create({ data: { key: SYNTHETIC_ORDER_POLICY_KEY, value: JSON.stringify(p) } });
    return { state: p.state, expiresAt: p.expiresAt, ordersCreated: 0, emailsClaimed: 0, maxOrders: p.maxOrders, maxEmails: p.maxEmails };
  });
}
export async function closeSyntheticProfile(db: Db, actor: { userId?: string; role?: string } | undefined) {
  assertSyntheticOwner(actor);
  return db.$transaction(async (tx: Db) => {
    const p = await lockedPolicy(tx); if (!p) throw stop();
    await tx.systemSetting.update({ where: { key: SYNTHETIC_ORDER_POLICY_KEY }, data: { value: JSON.stringify({ ...p, state: "CLOSED" }) } });
    return { state: "CLOSED", ordersCreated: p.ordersCreated, emailsClaimed: p.emailsClaimed };
  });
}
