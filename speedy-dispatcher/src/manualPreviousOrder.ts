export type PreviousOrder = {
  id: string;
  orderNumber: number;
  orderStatus?: string | null;
  createdAt?: string | null;
  deliveredAt?: string | null;
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

// History arrives newest first. Compare only the shopping basket: payment,
// dates, prices, notes and item ordering do not make it a different order.
export const getDistinctPreviousOrders = (
  orders: PreviousOrder[]
): PreviousOrder[] => {
  const selected: PreviousOrder[] = [];
  const signatures = new Set<string>();

  for (const order of orders) {
    const fields = getPreviousOrderFields(order);
    if (!fields) continue;

    const quantities = new Map<string, number>();
    for (const item of fields.items) {
      const name = item.itemName.trim().replace(/\s+/g, " ").toLowerCase();
      quantities.set(name, (quantities.get(name) ?? 0) + Number(item.quantity));
    }
    const signature = JSON.stringify([...quantities].sort(([a], [b]) => a.localeCompare(b)));
    if (signatures.has(signature)) continue;

    signatures.add(signature);
    selected.push(order);
    if (selected.length === 2) break;
  }

  return selected;
};
