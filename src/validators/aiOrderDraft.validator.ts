import { z } from "zod";
import { currentCartSchema } from "../services/aiOrderEdit";

const aiConversationTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1000)
}).strict();

export const aiOrderDraftRequestSchema = z.object({
  body: z.object({
    transcript: z.string().trim().min(1).max(1500),
    history: z.array(aiConversationTurnSchema).max(8).optional(),
    currentCart: currentCartSchema.optional()
  }).strict()
});
