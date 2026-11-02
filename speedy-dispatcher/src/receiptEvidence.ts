export type ReceiptChargeEvidence = {
  extraStops?: number;
  extraStopCharge?: string | number;
  distanceSurcharge?: string | number;
};

export type ReceiptEvidenceSource = {
  notes?: string | null;
  retainedChargeEvidence?: ReceiptChargeEvidence | null;
  createdAt?: string | null;
};

const noteAmount = (notes: string | null | undefined, label: string) => {
  if (!notes) return 0;
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = notes.match(new RegExp(`${escapedLabel}:\\s*\\$?([0-9]+(?:\\.[0-9]{1,2})?)`, "i"));
  const amount = Number(match?.[1] || 0);
  return Number.isFinite(amount) ? amount : 0;
};

export const receiptChargeAmount = (
  receipt: ReceiptEvidenceSource,
  field: "extraStopCharge" | "distanceSurcharge",
  noteLabel: string
) => {
  const retained = Number(receipt.retainedChargeEvidence?.[field]);
  if (Number.isFinite(retained) && retained >= 0) return retained;
  return noteAmount(receipt.notes, noteLabel);
};

export const receiptExtraStops = (receipt: ReceiptEvidenceSource) => {
  const retained = Number(receipt.retainedChargeEvidence?.extraStops);
  if (Number.isInteger(retained) && retained >= 0) return retained;
  const match = receipt.notes?.match(/Extra stops:\s*([0-9]+)/i);
  const count = Number(match?.[1] || 0);
  return Number.isInteger(count) && count >= 0 ? count : 0;
};

export const receiptEvidenceDate = (order: {
  deliveredAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  digitalReceipt?: ReceiptEvidenceSource | null;
}) => order.deliveredAt || order.digitalReceipt?.createdAt || order.createdAt || order.updatedAt || null;
