import { PaymentMethod } from "@prisma/client";

export const LEGACY_ETRANSFER_PAYMENT_METHOD = "E_TRANSFER" as const;

export type CompatiblePaymentMethod =
  | PaymentMethod
  | typeof LEGACY_ETRANSFER_PAYMENT_METHOD;

export const normalizePaymentMethod = (
  paymentMethod: CompatiblePaymentMethod
): PaymentMethod =>
  paymentMethod === LEGACY_ETRANSFER_PAYMENT_METHOD
    ? PaymentMethod.ETRANSFER
    : paymentMethod;
