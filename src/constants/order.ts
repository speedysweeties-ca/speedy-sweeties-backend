export const ORDER_STATUSES = [
  "PLACED",
  "ACCEPTED",
  "SHOPPING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED"
] as const;

export const PAYMENT_STATUSES = [
  "PENDING",
  "PAID",
  "FAILED",
  "REFUNDED"
] as const;

export const PAYMENT_METHODS = [
  "CASH",
  "DEBIT",
  "VISA",
  "MASTERCARD",
  "E_TRANSFER"
] as const;