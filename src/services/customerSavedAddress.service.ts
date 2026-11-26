import { Prisma } from "@prisma/client";

type Address = {
  addressLine1: string;
  unitNumber: string | null;
  buzzCode: string | null;
  city: string;
  province: string;
};

const normalize = (value: string | null) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");
const provinceKey = (value: string) => normalize(value) === "ontario" ? "on" : normalize(value);

// Called inside the successful order transaction. Use the same parent lock as
// address-book edits so the limit, numbered slots and single default stay valid.
export async function rememberOrderAddress(tx: Prisma.TransactionClient, customerId: string, address: Address): Promise<boolean> {
  await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
  const saved = await tx.customerAddress.findMany({ where: { customerId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const existing = saved.find(row =>
    normalize(row.addressLine1) === normalize(address.addressLine1) &&
    normalize(row.unitNumber) === normalize(address.unitNumber) &&
    normalize(row.city) === normalize(address.city) &&
    provinceKey(row.province) === provinceKey(address.province));
  // Keep all existing addresses and the order even if the address book is full.
  // The profile still remembers the delivery address, and dispatchers see a warning.
  if (!existing && saved.length >= 20) return false;
  await tx.customerAddress.updateMany({ where: { customerId, isDefault: true }, data: { isDefault: false } });
  if (existing) {
    await tx.customerAddress.update({ where: { id: existing.id }, data: { ...address, isDefault: true } });
  } else {
    const label = Array.from({ length: 20 }, (_, i) => `Address ${i + 1}`)
      .find(candidate => !saved.some(row => row.label === candidate))!;
    await tx.customerAddress.create({ data: { ...address, customerId, label, isDefault: true } });
  }
  return true;
}
