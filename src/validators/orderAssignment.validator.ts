import { z } from "zod";

export const assignDriverSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1)
  }),
  body: z.object({
    driverId: z.string().trim().min(1).nullable(),
    priority: z.enum(["NORMAL", "HIGH"]).optional()
  })
});

export type AssignDriverBody = z.infer<typeof assignDriverSchema>["body"];