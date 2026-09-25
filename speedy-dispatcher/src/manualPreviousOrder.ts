export type PreviousOrder = {
  id: string;
  orderNumber: number;
  paymentMethod?: string | null;
  items?: { name: string; quantity: number }[];
};

export type PreviousOrderFields = {
  items: { itemName: string; quantity: string }[];
  paymentMethod?: "CASH" | "DEBIT" | "VISA" | "MASTERCARD" | "ETRANSFER";
};

export const getPreviousOrderFields = (
  order: PreviousOrder
): PreviousOrderFields | null => {
  // Do not silently load only part of an order or guess quantities from itemsText.
  if (
    !Array.isArray(order.items) ||
    order.items.length === 0 ||
    order.items.some(
      (item) =>
        typeof item.name !== "string" ||
        !item.name.trim() ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0
    )
  ) {
    return null;
  }

  const fields: PreviousOrderFields = {
    items: order.items.map((item) => ({
      itemName: item.name,
      quantity: String(item.quantity),
    })),
  };

  switch (order.paymentMethod) {
    case "CASH":
    case "DEBIT":
    case "VISA":
    case "MASTERCARD":
    case "ETRANSFER":
      fields.paymentMethod = order.paymentMethod;
  }

  return fields;
};
