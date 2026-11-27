import { createHash } from "node:crypto";

export type ReceiptItemSnapshot = { id: string; name: string; quantity: number };

export function validReceiptItems(value: unknown): value is ReceiptItemSnapshot[] {
  return Array.isArray(value) && value.length <= 1000 && value.every(item =>
    item && typeof item.id === "string" && item.id.length > 0 && item.id.length <= 200 &&
    typeof item.name === "string" && item.name.length <= 2000 &&
    Number.isInteger(item.quantity) && item.quantity > 0
  ) && new Set(value.map(item => item.id)).size === value.length;
}

export function sameReceiptItems(left: ReceiptItemSnapshot[], right: ReceiptItemSnapshot[]): boolean {
  if (left.length !== right.length) return false;
  const byId = new Map(right.map(item => [item.id, item]));
  return left.every(item => {
    const current = byId.get(item.id);
    return current?.name === item.name && current.quantity === item.quantity;
  });
}

export function receiptItemsFingerprint(items: ReceiptItemSnapshot[]): string {
  const canonical = items.map(({ id, name, quantity }) => [id, name, quantity])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function receiptMatchesItems(fingerprint: string | null | undefined, items: ReceiptItemSnapshot[]): boolean {
  return !!fingerprint && fingerprint === receiptItemsFingerprint(items);
}
