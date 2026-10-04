import { z } from "zod";

export const staffPassword = z.string().min(6, "Password must be at least 6 characters long")
  .refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password must be no longer than 72 bytes");
const version = z.number().int().nonnegative();
const params = z.object({ id: z.string().min(1).max(100) });

export const staffProfileSchema = z.object({ params, body: z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["DRIVER", "DISPATCHER"]),
  staffRevision: version,
}).strict() });

export const staffStatusSchema = z.object({ params, body: z.object({
  isActive: z.boolean(), staffRevision: version,
}).strict() });

export const staffResetSchema = z.object({ params, body: z.object({
  temporaryPassword: staffPassword, staffRevision: version,
}).strict() });

export const passwordChangeSchema = z.object({ body: z.object({
  resetToken: z.string().min(1).max(4096), password: staffPassword,
}).strict() });
