import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const INTAKE_POLICY = "SS-PRIVACY-INTAKE-1.0";
export const INTAKE_PURPOSE = "ADMIN_INTAKE_DELETE_V1";
export const INTAKE_GRANT_MS = 24 * 60 * 60 * 1000;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const ownership = z.discriminatedUnion("method", [
  z.object({ method: z.literal("HISTORICAL_VERIFIED_EMAIL"), priorChallengeId: z.string().uuid(),
    continuityConfirmed: z.literal(true), exactPersonRecordLinkConfirmed: z.literal(true) }).strict(),
  z.object({ method: z.literal("PRIOR_PERSONAL_RECOGNITION"), genuinePriorRecognitionConfirmed: z.literal(true),
    directPrivateInteractionConfirmed: z.literal(true), exactPersonRecordLinkConfirmed: z.literal(true) }).strict()
]);
export const intakeIssueSchema = z.object({
  subjectId: z.string().uuid(), sourceOrderId: z.string().uuid(), scopeHash: hash,
  policyReference: z.literal(INTAKE_POLICY), receivedAt: z.string().datetime(),
  destination: z.string().trim().email().max(254),
  privateReviewReference: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/),
  conflictsReviewed: z.literal(true), ownershipDisputed: z.literal(false),
  sharedOrReassignedContact: z.literal(false), thirdPartyAuthorityUnresolved: z.literal(false),
  evidence: ownership
}).strict();
export type IntakeIssue = z.infer<typeof intakeIssueSchema>;
export type IntakeActor = { userId: string; authVersion: number };
const claimsSchema = z.object({
  v: z.literal(1), policy: z.literal(INTAKE_POLICY), id: z.string().uuid(),
  actorId: z.string().uuid(), authVersion: z.number().int().nonnegative(),
  scopeHash: hash, destinationHash: hash, fingerprint: hash, reviewHash: hash,
  receivedAt: z.string().datetime(), method: z.enum(["HISTORICAL_VERIFIED_EMAIL", "PRIOR_PERSONAL_RECOGNITION"]),
  priorChallengeId: z.string().uuid().optional(), issuedAt: z.number().int(), expiresAt: z.number().int()
}).strict();
export type IntakeClaims = z.infer<typeof claimsSchema>;
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function signIntakeGrant(claims: IntakeClaims, mac: (s: string) => string) {
  const data = Buffer.from(JSON.stringify(claimsSchema.parse(claims))).toString("base64url");
  return `ig1.${data}.${mac(`admin-intake-grant-v1:${data}`)}`;
}
export function readIntakeGrant(value: string, mac: (s: string) => string, now = Date.now()): IntakeClaims | null {
  try {
    if (value.length > 4096 || !/^ig1\.[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(value)) return null;
    const [, data, signature] = value.split(".");
    if (!equal(signature, mac(`admin-intake-grant-v1:${data}`))) return null;
    const bytes = Buffer.from(data, "base64url");
    if (bytes.toString("base64url") !== data) return null;
    const c = claimsSchema.parse(JSON.parse(bytes.toString("utf8")));
    if (c.expiresAt - c.issuedAt !== INTAKE_GRANT_MS || c.issuedAt > now || c.expiresAt <= now) return null;
    if ((c.method === "HISTORICAL_VERIFIED_EMAIL") !== !!c.priorChallengeId) return null;
    return c;
  } catch { return null; }
}
