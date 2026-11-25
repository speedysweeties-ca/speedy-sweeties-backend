import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

export const savedAddressSchema = z.object({
  addressLine1: z.string().trim().min(1).max(250),
  unitNumber: z.string().trim().max(50).nullable().optional().transform(v => v || null),
  buzzCode: z.string().trim().max(50).nullable().optional().transform(v => v || null),
  city: z.string().trim().min(1).max(100),
  province: z.string().trim().min(1).max(100),
  isDefault: z.boolean().optional().default(false),
}).strict();

// All mutations lock the parent, including delete, so concurrent default changes
// serialize. The partial unique index also protects the invariant outside this API.
export async function mutateCustomerAddressController(req: Request, res: Response): Promise<void> {
  const customerId = String(req.params.id);
  const addressId = req.params.addressId ? String(req.params.addressId) : null;
  const deleting = req.method === "DELETE";
  const parsed = savedAddressSchema.safeParse(req.body);
  if (!deleting && !parsed.success) {
    res.status(400).json({ success: false, message: "Check the saved address fields" });
    return;
  }
  const result = await prisma.$transaction(async tx => {
    const customer = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
    if (!customer.length) return { status: 404, message: "Customer not found" };
    const existing = addressId ? await tx.customerAddress.findFirst({ where: { id: addressId, customerId } }) : null;
    if (addressId && !existing) return { status: 404, message: "Saved address not found" };
    if (deleting) {
      if (!existing) return { status: 404, message: "Saved address not found" };
      await tx.customerAddress.delete({ where: { id: existing.id } });
      if (existing.isDefault) {
        const next = await tx.customerAddress.findFirst({ where: { customerId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
        if (next) await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    } else if (parsed.success) {
      const count = await tx.customerAddress.count({ where: { customerId } });
      if (!existing && count >= 20) return { status: 400, message: "A customer can save up to 20 addresses" };
      // Keep an existing default until another address is explicitly chosen.
      const isDefault = parsed.data.isDefault || existing?.isDefault || count === 0;
      if (isDefault) await tx.customerAddress.updateMany({ where: { customerId, isDefault: true }, data: { isDefault: false } });
      // Stable numbered slots: changing the default or removing another entry
      // must not rename an address. New entries reuse the first available number.
      const saved = await tx.customerAddress.findMany({ where: { customerId } });
      const label = existing?.label || Array.from({ length: 20 }, (_, i) => `Address ${i + 1}`)
        .find(candidate => !saved.some(address => address.label === candidate))!;
      const data = { ...parsed.data, isDefault, label };
      if (existing) await tx.customerAddress.update({ where: { id: existing.id }, data });
      else await tx.customerAddress.create({ data: { ...data, customerId } });
    }
    const addresses = await tx.customerAddress.findMany({ where: { customerId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }, { id: "asc" }] });
    return { status: 200, addresses };
  });
  res.status(result.status).json({ success: result.status === 200, ...result });
}

export async function listCustomerAddressesController(req: Request, res: Response): Promise<void> {
  const customerId = String(req.params.id);
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) { res.status(404).json({ success: false, message: "Customer not found" }); return; }
  const addresses = await prisma.customerAddress.findMany({ where: { customerId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }, { id: "asc" }] });
  res.json({ success: true, addresses });
}
