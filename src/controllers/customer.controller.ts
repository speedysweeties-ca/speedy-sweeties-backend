import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const normalize = (value: string) => value.trim().toLowerCase();

const normalizePhone = (value: string) => value.replace(/\D/g, "");

type CustomerIdParams = {
  id: string;
};

const cleanStringOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const getCustomerLoyaltyController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const rawPhone = req.query.phone;
  const rawEmail = req.query.email;

  const phone = typeof rawPhone === "string" ? normalizePhone(rawPhone) : "";

  const email =
    typeof rawEmail === "string" && rawEmail.trim()
      ? normalize(rawEmail)
      : "";

  if (!phone && !email) {
    res.status(400).json({
      success: false,
      message: "Phone or email is required",
    });
    return;
  }

  const customer = await prisma.customer.findFirst({
    where: {
      OR: [
        ...(phone ? [{ normalizedPhone: phone }] : []),
        ...(email ? [{ normalizedEmail: email }] : []),
      ],
    },
    select: {
      id: true,
      loyaltyCompletedOrders: true,
      loyaltyRewardsEarned: true,
      loyaltyRewardsUsed: true,
      loyaltyFreeDelivery: true,
    },
  });

  if (!customer) {
    res.status(200).json({
      success: true,
      found: false,
      loyalty: {
        loyaltyCompletedOrders: 0,
        loyaltyRewardsEarned: 0,
        loyaltyRewardsUsed: 0,
        loyaltyFreeDelivery: false,
        deliveriesRemaining: 10,
      },
    });
    return;
  }

  const deliveriesRemaining = customer.loyaltyFreeDelivery
    ? 0
    : Math.max(10 - customer.loyaltyCompletedOrders, 0);

  res.status(200).json({
    success: true,
    found: true,
    loyalty: {
      loyaltyCompletedOrders: customer.loyaltyCompletedOrders,
      loyaltyRewardsEarned: customer.loyaltyRewardsEarned,
      loyaltyRewardsUsed: customer.loyaltyRewardsUsed,
      loyaltyFreeDelivery: customer.loyaltyFreeDelivery,
      deliveriesRemaining,
    },
  });
};

export const searchCustomersController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const rawQuery = req.query.query;

  if (!rawQuery || typeof rawQuery !== "string") {
    res.status(400).json({
      success: false,
      message: "Query is required",
    });
    return;
  }

  const searchText = rawQuery.trim();
  const normalizedQuery = normalize(searchText);
  const normalizedPhone = normalizePhone(searchText);

  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { normalizedFullName: { contains: normalizedQuery } },
        { normalizedPhone: { contains: normalizedPhone } },
        { normalizedEmail: { contains: normalizedQuery } },
        { addressLine1: { contains: searchText, mode: "insensitive" } },
        { city: { contains: searchText, mode: "insensitive" } },
        { postalCode: { contains: searchText, mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: {
      updatedAt: "desc",
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
      dispatcherNotes: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          orders: true,
        },
      },
    },
  });

  res.status(200).json({
    success: true,
    count: customers.length,
    customers,
  });
};

export const listCustomersController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const rawQuery = req.query.query;
  const searchText = typeof rawQuery === "string" ? rawQuery.trim() : "";

  const normalizedQuery = searchText ? normalize(searchText) : "";
  const normalizedPhone = searchText ? normalizePhone(searchText) : "";

  const customers = await prisma.customer.findMany({
    where:
      normalizedQuery.length >= 2
        ? {
            OR: [
              { normalizedFullName: { contains: normalizedQuery } },
              { normalizedPhone: { contains: normalizedPhone } },
              { normalizedEmail: { contains: normalizedQuery } },
              { addressLine1: { contains: searchText, mode: "insensitive" } },
              { city: { contains: searchText, mode: "insensitive" } },
              { postalCode: { contains: searchText, mode: "insensitive" } },
            ],
          }
        : {},
    orderBy: {
      updatedAt: "desc",
    },
    take: 100,
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      addressLine1: true,
      city: true,
      province: true,
      postalCode: true,
      dispatcherNotes: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          orders: true,
        },
      },
    },
  });

  res.status(200).json({
    success: true,
    count: customers.length,
    customers,
  });
};

export const getCustomerByIdController = async (
  req: Request<CustomerIdParams>,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      orders: {
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          paymentMethod: true,
          itemsText: true,
          additionalNotes: true,
          createdAt: true,
          deliveredAt: true,
          items: {
            select: {
              id: true,
              name: true,
              quantity: true,
              price: true,
            },
          },
        },
      },
    },
  });

  if (!customer) {
    res.status(404).json({
      success: false,
      message: "Customer not found",
    });
    return;
  }

  res.status(200).json({
    success: true,
    customer,
  });
};

export const updateCustomerController = async (
  req: Request<CustomerIdParams>,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const existingCustomer = await prisma.customer.findUnique({
    where: { id },
  });

  if (!existingCustomer) {
    res.status(404).json({
      success: false,
      message: "Customer not found",
    });
    return;
  }

  const {
    fullName,
    phone,
    email,
    addressLine1,
    city,
    province,
    postalCode,
    dispatcherNotes,
  } = req.body;

  const cleanedFullName =
    typeof fullName === "string" && fullName.trim()
      ? fullName.trim()
      : existingCustomer.fullName;

  const cleanedPhone =
    typeof phone === "string" && phone.trim()
      ? phone.trim()
      : existingCustomer.phone;

  const cleanedEmail = cleanStringOrNull(email);

  const cleanedAddressLine1 =
    typeof addressLine1 === "string" && addressLine1.trim()
      ? addressLine1.trim()
      : existingCustomer.addressLine1;

  const cleanedCity =
    typeof city === "string" && city.trim()
      ? city.trim()
      : existingCustomer.city;

  const cleanedProvince =
    typeof province === "string" && province.trim()
      ? province.trim()
      : existingCustomer.province;

  const cleanedPostalCode =
    typeof postalCode === "string" && postalCode.trim()
      ? postalCode.trim().toUpperCase()
      : existingCustomer.postalCode;

  const updatedCustomer = await prisma.customer.update({
    where: { id },
    data: {
      fullName: cleanedFullName,
      normalizedFullName: normalize(cleanedFullName),
      phone: cleanedPhone,
      normalizedPhone: normalizePhone(cleanedPhone),
      email: cleanedEmail,
      normalizedEmail: cleanedEmail ? normalize(cleanedEmail) : null,
      addressLine1: cleanedAddressLine1,
      city: cleanedCity,
      province: cleanedProvince,
      postalCode: cleanedPostalCode,
      dispatcherNotes:
        typeof dispatcherNotes === "string"
          ? dispatcherNotes.trim()
          : existingCustomer.dispatcherNotes,
    },
  });

  res.status(200).json({
    success: true,
    message: "Customer updated successfully",
    customer: updatedCustomer,
  });
};

export const updateCustomerDispatcherNotesController = async (
  req: Request<CustomerIdParams>,
  res: Response
): Promise<void> => {
  const id = String(req.params.id);
  const { dispatcherNotes } = req.body;

  const existingCustomer = await prisma.customer.findUnique({
    where: { id },
  });

  if (!existingCustomer) {
    res.status(404).json({
      success: false,
      message: "Customer not found",
    });
    return;
  }

  const updatedCustomer = await prisma.customer.update({
    where: { id },
    data: {
      dispatcherNotes:
        typeof dispatcherNotes === "string" ? dispatcherNotes.trim() : "",
    },
  });

  res.status(200).json({
    success: true,
    message: "Dispatcher notes updated",
    customer: updatedCustomer,
  });
};