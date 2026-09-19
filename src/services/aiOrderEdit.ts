import { z } from "zod";
import type { ModelOrderDraft } from "./aiOrderDraft.service";

export const currentCartSchema = z.array(z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(100)
}).strict()).max(25);

export type CurrentCart = z.infer<typeof currentCartSchema>;

export const orderEditSchema = z.object({
  status: z.enum(["READY", "NEEDS_CLARIFICATION"]),
  assistantMessage: z.string().trim().min(1).max(300),
  clarificationQuestion: z.string().trim().min(1).max(250).nullable(),
  operations: z.array(z.object({
    action: z.enum(["UPDATE", "REMOVE", "ADD"]),
    index: z.number().int().min(0).max(24).nullable(),
    requestedName: z.string().trim().min(1).max(200).nullable(),
    packageDescription: z.string().trim().min(1).max(100).nullable(),
    quantity: z.number().int().min(1).max(1_000_000).nullable(),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"])
  }).strict()).max(50),
  paymentMethod: z.enum(["CASH", "DEBIT", "VISA", "MASTERCARD", "ETRANSFER"]).nullable(),
  additionalNotes: z.string().trim().max(500).nullable()
}).strict();

export const ORDER_EDIT_INSTRUCTIONS = [
  "CURRENT CART EDIT MODE: the supplied currentCart is the authoritative order as it appears on the customer's form, including manual edits. Earlier conversation must never reset it.",
  "Return operations only for changes the customer requests. Do not reconstruct the complete order. Ignore the earlier instruction to return items.",
  "Use the zero-based currentCart index for UPDATE or REMOVE; ADD must have index null. Each existing index can appear at most once.",
  "Unmentioned items and items the customer says to keep the same need NO operation. Never remove them merely because they are absent from the latest sentence.",
  "UPDATE quantity is the new total only when the customer explicitly changes it; otherwise quantity MUST be null. Null preserves the exact current quantity; never default it to 1.",
  "UPDATE requestedName and packageDescription must both be null unless the customer explicitly changes the product or size. When changing either, provide the complete intended product and size.",
  "ADD requires a product name and a known quantity. REMOVE requires an existing index and all product and quantity fields null.",
  "Example: currentCart has Smirnoff 750ml quantity 2 at index 0 and ice quantity 3 at index 1. 'Change to five bags of ice but keep Smirnoff the same' produces only UPDATE index 1, quantity 5, requestedName null, packageDescription null. Smirnoff gets no operation.",
  "For 'add two more' calculate the new total from currentCart. For an explicit replacement of the entire order, remove the old rows and add the requested rows.",
  "Use history to understand a clarification answer, but use currentCart for existing names and quantities. If the affected item or requested change is ambiguous, ask one clarification question instead of guessing."
].join("\n");

// Apply a patch to the actual cart. Unchanged rows and null quantities never
// pass through a model-generated default or a newly reconstructed order.
export const applyOrderEdit = (
  cart: CurrentCart,
  edit: z.infer<typeof orderEditSchema>
): ModelOrderDraft => {
  const rows: (ModelOrderDraft["items"][number] | null)[] = cart.map<ModelOrderDraft["items"][number]>(item => ({
    requestedName: item.name, packageDescription: null,
    quantity: item.quantity, confidence: "HIGH"
  }));
  const seen = new Set<number>();
  const invalid = (): ModelOrderDraft => ({
    status: "NEEDS_CLARIFICATION", assistantMessage: "I need one more detail.",
    clarificationQuestion: "Which item would you like to change, and what should it be?",
    items: cart.map<ModelOrderDraft["items"][number]>(item => ({ requestedName: item.name, packageDescription: null,
      quantity: item.quantity, confidence: "HIGH" })),
    paymentMethod: null, additionalNotes: null
  });
  if (edit.status !== "READY") return { ...invalid(), clarificationQuestion: edit.clarificationQuestion };
  for (const op of edit.operations) {
    if (op.action === "ADD") {
      if (op.index !== null || op.requestedName === null || op.quantity === null) return invalid();
      rows.push({ requestedName: op.requestedName, packageDescription: op.packageDescription,
        quantity: op.quantity, confidence: op.confidence });
      continue;
    }
    if (op.index === null || op.index >= cart.length || seen.has(op.index)) return invalid();
    seen.add(op.index);
    if (op.action === "REMOVE") {
      if (op.requestedName !== null || op.packageDescription !== null || op.quantity !== null) return invalid();
      rows[op.index] = null;
    } else {
      const old = rows[op.index]!;
      if (op.packageDescription !== null && op.requestedName === null) return invalid();
      rows[op.index] = {
        requestedName: op.requestedName ?? old.requestedName,
        packageDescription: op.packageDescription,
        quantity: op.quantity ?? old.quantity,
        confidence: op.confidence
      };
    }
  }
  const items = rows.filter((row): row is ModelOrderDraft["items"][number] => row !== null);
  if (items.length > 25) return invalid();
  return { status: edit.status, assistantMessage: edit.assistantMessage,
    clarificationQuestion: edit.clarificationQuestion, items,
    paymentMethod: edit.paymentMethod, additionalNotes: edit.additionalNotes };
};
