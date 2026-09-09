import { z } from "zod";
import { OrderStatus, PaymentMethod } from "@prisma/client";

import { RECURRING_DRIVER_NOTES_MAX_LENGTH } from "../services/recurringDriverNotes.service";
import { LEGACY_ETRANSFER_PAYMENT_METHOD } from "../utils/paymentMethod";

const phoneRegex = /^[0-9()+\-.\s]{7,20}$/;

const MAX_CUSTOMER_ITEM_ESTIMATE = 10_000;
const MAX_CUSTOMER_ORDER_ESTIMATE = 50_000;

const moneyField = z.number().finite().min(0).max(MAX_CUSTOMER_ORDER_ESTIMATE);
const itemEstimateField = z
  .number()
  .finite()
  .min(0)
  .max(MAX_CUSTOMER_ITEM_ESTIMATE);

const orderItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(100),
  unitPrice: itemEstimateField,
  totalPrice: itemEstimateField
});

const editableOrderItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(100),
  unitPrice: itemEstimateField.optional(),
  totalPrice: itemEstimateField.optional(),
  price: itemEstimateField.optional()
});

const orderIdParamsSchema = z.object({
  id: z.string().trim().min(1)
});

const publicOrderSourceSchema = z.enum([
  "UNKNOWN",
  "ANDROID_APP",
  "IOS_APP",
  "WEBFLOW"
]);

const attributionField = z.string().trim().max(150).optional();

const compatiblePaymentMethodSchema = z.union([
  z.nativeEnum(PaymentMethod),
  z.literal(LEGACY_ETRANSFER_PAYMENT_METHOD)
]);

export const createOrderSchema = z.object({
  body: z.object({
    customerName: z.string().trim().min(2).max(120),
    customerPhone: z.string().trim().regex(phoneRegex, "Invalid phone number"),
    customerEmail: z.string().trim().email(),
    addressLine1: z.string().trim().min(3).max(200),
    addressLine2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(2).max(100),
    province: z.string().trim().min(2).max(100),
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
    paymentMethod: compatiblePaymentMethodSchema,
    orderSource: publicOrderSourceSchema.optional(),
    utmSource: attributionField,
    utmMedium: attributionField,
    utmCampaign: attributionField,
    utmContent: attributionField,
    utmTerm: attributionField,
    referralCode: attributionField
  }).superRefine((order, ctx) => {
    const estimatedItemTotal = order.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

    if (estimatedItemTotal > MAX_CUSTOMER_ORDER_ESTIMATE) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Estimated item total is too large"
      });
    }
  })
});

export const createManualOrderSchema = createOrderSchema.extend({
  body: createOrderSchema.shape.body.safeExtend({
    recurringDriverNotes: z
      .string()
      .trim()
      .max(RECURRING_DRIVER_NOTES_MAX_LENGTH)
      .optional()
  })
});

export const getOrderByIdSchema = z.object({
  params: orderIdParamsSchema
});

export const updateOrderStatusSchema = z.object({
  params: orderIdParamsSchema,
  body: z.object({
    orderStatus: z.nativeEnum(OrderStatus),
    cancellationReason: z.string().trim().max(500).optional()
  })
});

export const updateOrderDetailsSchema = z.object({
  params: orderIdParamsSchema,
  body: z.object({
    customerName: z.string().trim().min(2).max(120),
    customerPhone: z.string().trim().regex(phoneRegex, "Invalid phone number"),
    customerEmail: z.string().trim().email(),
    addressLine1: z.string().trim().min(3).max(200),
    city: z.string().trim().min(2).max(100),
    province: z.string().trim().min(2).max(100),
    additionalNotes: z.string().trim().max(1000).optional().nullable(),
    paymentMethod: compatiblePaymentMethodSchema,
    items: z.array(editableOrderItemSchema).min(1)
  })
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>["body"];
export type CreateManualOrderInput = z.infer<
  typeof createManualOrderSchema
>["body"];
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>["body"];
export type UpdateOrderDetailsInput = z.infer<typeof updateOrderDetailsSchema>["body"];
