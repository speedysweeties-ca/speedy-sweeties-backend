import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const normalize = (value: string) => value.trim().toLowerCase();

const normalizePhone = (value: string) => value.replace(/\D/g, "");

type CustomerIdParams = {
  id: string;
};

type CustomerSearchResult = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  addressLine1: string;
  city: string;
  province: string;
  postalCode: string;
  dispatcherNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    orders: number;
  };
};

const cleanStringOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const isPhoneOnlySearch = (searchText: string) => {
  const digits = normalizePhone(searchText);
  const nonDigits = searchText.replace(/\d/g, "").trim();

  return digits.length >= 3 && nonDigits.length === 0;
};

const getCustomerSearchScore = (
  customer: CustomerSearchResult,
  searchText: string
) => {
  const query = normalize(searchText);
  const queryDigits = normalizePhone(searchText);

  const name = normalize(customer.fullName || "");
  const email = normalize(customer.email || "");
  const address = normalize(customer.addressLine1 || "");
  const city = normalize(customer.city || "");
  const postalCode = normalize(customer.postalCode || "");
  const phone = normalizePhone(customer.phone || "");

  if (name === query) return 1000;
  if (name.startsWith(query)) return 900;
  if (address === query) return 850;
  if (address.startsWith(query)) return 800;
  if (address.includes(query)) return 750;
  if (postalCode === query) return 700;
  if (postalCode.includes(query)) return 650;
  if (city === query) return 600;
  if (city.includes(query)) return 550;
  if (name.includes(query)) return 500;
  if (email.startsWith(query)) return 450;
  if (email.includes(query)) return 400;

  if (isPhoneOnlySearch(searchText) && queryDigits && phone.startsWith(queryDigits)) {
    return 350;
  }

  if (isPhoneOnlySearch(searchText) && queryDigits && phone.includes(queryDigits)) {
    return 300;
  }

  return 0;
};

const sortCustomersBySearchRelevance = (
  customers: CustomerSearchResult[],
  searchText: string
) => {
  return [...customers]
    .map((customer) => ({
      customer,
      score: getCustomerSearchScore(customer, searchText),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      const bOrders = b.customer._count?.orders || 0;
      const aOrders = a.customer._count?.orders || 0;

      if (bOrders !== aOrders) return bOrders - aOrders;

      return (
        new Date(b.customer.updatedAt).getTime() -
        new Date(a.customer.updatedAt).getTime()
      );
    })
    .map((entry) => entry.customer);
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
  const shouldSearchPhone = isPhoneOnlySearch(searchText);

  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { normalizedFullName: { contains: normalizedQuery } },
        ...(shouldSearchPhone
          ? [{ normalizedPhone: { contains: normalizedPhone } }]
          : []),
        { normalizedEmail: { contains: normalizedQuery } },
        { addressLine1: { contains: searchText, mode: "insensitive" } },
        { city: { contains: searchText, mode: "insensitive" } },
        { postalCode: { contains: searchText, mode: "insensitive" } },
      ],
    },
    take: 100,
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

  const sortedCustomers = sortCustomersBySearchRelevance(
    customers as CustomerSearchResult[],
    searchText
  ).slice(0, 10);

  res.status(200).json({
    success: true,
    count: sortedCustomers.length,
    customers: sortedCustomers,
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
  const shouldSearchPhone = searchText ? isPhoneOnlySearch(searchText) : false;

  const customers = await prisma.customer.findMany({
    where:
      normalizedQuery.length >= 2
        ? {
            OR: [
              { normalizedFullName: { contains: normalizedQuery } },
              ...(shouldSearchPhone
                ? [{ normalizedPhone: { contains: normalizedPhone } }]
                : []),
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
    take: normalizedQuery.length >= 2 ? 100 : 100,
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

  const finalCustomers =
    normalizedQuery.length >= 2
      ? sortCustomersBySearchRelevance(
          customers as CustomerSearchResult[],
          searchText
        ).slice(0, 100)
      : customers;

  res.status(200).json({
    success: true,
    count: finalCustomers.length,
    customers: finalCustomers,
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