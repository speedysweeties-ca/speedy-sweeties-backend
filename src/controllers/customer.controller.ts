import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const normalize = (value: string) => value.trim().toLowerCase();

const normalizePhone = (value: string) => value.replace(/\D/g, "");

export const searchCustomersController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const rawQuery = req.query.query;

  if (!rawQuery || typeof rawQuery !== "string") {
    res.status(400).json({
      success: false,
      message: "Query is required"
    });
    return;
  }

  const normalizedQuery = normalize(rawQuery);
  const normalizedPhone = normalizePhone(rawQuery);

  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { normalizedFullName: { contains: normalizedQuery } },
        { normalizedPhone: { contains: normalizedPhone } },
        { normalizedEmail: { contains: normalizedQuery } }
      ]
    },
    take: 10,
    orderBy: {
      createdAt: "desc"
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      addressLine1: true,
      city: true,
      province: true,
      postalCode: true,
      dispatcherNotes: true
    }
  });

  res.status(200).json({
    success: true,
    count: customers.length,
    customers
  });
};

export const updateCustomerDispatcherNotesController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { dispatcherNotes } = req.body;

  const updatedCustomer = await prisma.customer.update({
    where: { id },
    data: {
      dispatcherNotes:
        typeof dispatcherNotes === "string" ? dispatcherNotes.trim() : ""
    }
  });

  res.status(200).json({
    success: true,
    message: "Dispatcher notes updated",
    customer: updatedCustomer
  });
};