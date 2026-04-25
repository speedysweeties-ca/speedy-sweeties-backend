import { z } from "zod";
import { UserRole } from "@prisma/client";

export const registerUserSchema = z.object({
  body: z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Invalid email address"),

    password: z
      .string()
      .min(6, "Password must be at least 6 characters long"),

    role: z.nativeEnum(UserRole),

    firstName: z
      .string()
      .trim()
      .min(1, "First name cannot be empty")
      .max(100, "First name is too long")
      .optional(),

    lastName: z
      .string()
      .trim()
      .min(1, "Last name cannot be empty")
      .max(100, "Last name is too long")
      .optional()
  })
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>["body"];