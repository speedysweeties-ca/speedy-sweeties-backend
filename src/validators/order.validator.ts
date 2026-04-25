import { z } from "zod";
import { OrderStatus, PaymentMethod } from "@prisma/client";

const postalCodeRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
const phoneRegex = /^[0-9()+\-.\s]{7,20}$/;

const moneyField = z.number().min(0);

const orderItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(100),
  unitPrice: moneyField,
  totalPrice: moneyField
});

const orderIdParamsSchema = z.object({
  id: z.string().trim().min(1)
});

const listOrdersQuerySchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  customerEmail: z.string().trim().email().optional()
});

export const createOrderSchema = z.object({
  body: z.object({
    customerName: z.string().trim().min(2).max(120),
    customerPhone: z.string().trim().regex(phoneRegex, "Invalid phone number"),
    customerEmail: z.string().trim().email(),
    addressLine1: z.string().trim().min(3).max(200),
    addressLine2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(2).max(100),
    province: z.string().trim().min(2).max(100),
    postalCode: z
      .string()
      .trim()
      .regex(postalCodeRegex, "Invalid Canadian postal code"),
    deliveryInstructions: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(1000).optional(),
    dispatcherNotes: z.string().trim().max(1000).optional(),
    items: z.array(orderItemSchema).min(1),
    subtotal: moneyField,
    deliveryFee: moneyField,
    tax: moneyField,
    tip: moneyField,
    discount: moneyField,
    total: moneyField,
    paymentMethod: z.nativeEnum(PaymentMethod)
  })
});

export const getOrderByIdSchema = z.object({
  params: orderIdParamsSchema
});

export const listOrdersSchema = z.object({
  query: listOrdersQuerySchema
});

export const updateOrderStatusSchema = z.object({
  params: orderIdParamsSchema,
  body: z.object({
    orderStatus: z.nativeEnum(OrderStatus)
  })
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>["body"];
export type ListOrdersQueryInput = z.infer<typeof listOrdersSchema>["query"];
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>["body"];