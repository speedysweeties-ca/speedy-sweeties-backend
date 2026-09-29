import assert from "node:assert/strict";
import test from "node:test";
import { getDistinctPreviousOrders, getPreviousOrderFields, type PreviousOrder } from "./manualPreviousOrder.ts";

test("previous order loads separate items and exact quantities without prices or old notes", () => {
  const order = {
    id: "previous",
    orderNumber: 42,
    paymentMethod: "DEBIT",
    additionalNotes: "Old delivery instructions",
    items: [
      { name: "2 litre pop", quantity: 3, price: 12 },
      { name: "Bag of ice", quantity: 2, price: 7 },
    ],
  };
  assert.deepEqual(getPreviousOrderFields(order), {
    paymentMethod: "DEBIT",
    items: [
      { itemName: "2 litre pop", quantity: "3" },
      { itemName: "Bag of ice", quantity: "2" },
    ],
  });
  assert.equal(order.items[0].quantity, 3);
});

test("unknown or missing historical payment methods preserve the current selection", () => {
  for (const paymentMethod of [undefined, null, "CREDIT", "OTHER"]) {
    const fields = getPreviousOrderFields({
      id: "previous", orderNumber: 42, paymentMethod,
      items: [{ name: "Item", quantity: 1 }],
    });
    assert.equal(Object.hasOwn(fields!, "paymentMethod"), false);
  }
});

test("orders without complete valid item details cannot load partial or guessed orders", () => {
  const base = { id: "previous", orderNumber: 42 };
  assert.equal(getPreviousOrderFields(base), null);
  assert.equal(getPreviousOrderFields({ ...base, items: [] }), null);
  for (const item of [
    { name: "", quantity: 1 },
    { name: "  ", quantity: 1 },
    { name: "Item", quantity: 0 },
    { name: "Item", quantity: -1 },
    { name: "Item", quantity: NaN },
  ]) {
    assert.equal(getPreviousOrderFields({ ...base, items: [
      { name: "Valid item", quantity: 1 }, item,
    ] }), null);
  }
});

const historyOrder = (
  orderNumber: number,
  items = [{ name: "Bag of ice", quantity: 1 }]
): PreviousOrder => ({ id: `order-${orderNumber}`, orderNumber, items });

test("three repeated orders select the newest and the different fourth order", () => {
  const history = [
    historyOrder(4), historyOrder(3), historyOrder(2),
    historyOrder(1, [{ name: "2 litre pop", quantity: 2 }]),
    historyOrder(0, [{ name: "Another item", quantity: 1 }]),
  ];
  assert.deepEqual(getDistinctPreviousOrders(history), [history[0], history[3]]);
});

test("basket comparison ignores row order, case, spacing, split quantities and payment", () => {
  const latest = {
    ...historyOrder(3, [{ name: "Bag of ice", quantity: 2 }, { name: "2 litre pop", quantity: 1 }]),
    paymentMethod: "DEBIT", deliveredAt: "2026-09-28T17:30:00Z",
  };
  const same = {
    ...historyOrder(2, [
      { name: " 2  LITRE POP ", quantity: 1 },
      { name: "BAG of ICE", quantity: 1 },
      { name: "Bag of ice", quantity: 1 },
    ]),
    paymentMethod: "CASH", deliveredAt: "2026-09-27T16:30:00Z",
  };
  const different = historyOrder(1);
  const before = structuredClone([latest, same, different]);
  assert.deepEqual(getDistinctPreviousOrders([latest, same, different]), [latest, different]);
  assert.deepEqual([latest, same, different], before);
});

test("a changed quantity, product size, added item or removed item is a different basket", () => {
  const latest = historyOrder(2, [{ name: "2 litre pop", quantity: 2 }, { name: "Bag of ice", quantity: 1 }]);
  for (const items of [
    [{ name: "2 litre pop", quantity: 3 }, { name: "Bag of ice", quantity: 1 }],
    [{ name: "1 litre pop", quantity: 2 }, { name: "Bag of ice", quantity: 1 }],
    [...latest.items!, { name: "Chips", quantity: 1 }],
    [{ name: "2 litre pop", quantity: 2 }],
  ]) {
    const older = historyOrder(1, items);
    assert.deepEqual(getDistinctPreviousOrders([latest, older]), [latest, older]);
  }
});

test("no history, one basket and unusable historical details never produce a duplicate box", () => {
  assert.deepEqual(getDistinctPreviousOrders([]), []);
  const latest = historyOrder(3);
  assert.deepEqual(getDistinctPreviousOrders([latest, historyOrder(2), historyOrder(1)]), [latest]);
  const unusable = { id: "legacy", orderNumber: 4 };
  const partial = historyOrder(2, [{ name: "Another item", quantity: 1 }, { name: "", quantity: 2 }]);
  const different = historyOrder(1, [{ name: "Pop", quantity: 1 }]);
  assert.deepEqual(getDistinctPreviousOrders([unusable, latest, partial, different]), [latest, different]);
});

test("retaining the first basket across pages finds a distinct order after more than 20 repeats", () => {
  const firstPage = Array.from({ length: 20 }, (_, i) => historyOrder(50 - i));
  const nextPage = Array.from({ length: 10 }, (_, i) => historyOrder(30 - i));
  const different = historyOrder(20, [{ name: "Pop", quantity: 3 }]);
  const selected = getDistinctPreviousOrders(firstPage);
  assert.deepEqual(getDistinctPreviousOrders([...selected, ...nextPage, different]), [firstPage[0], different]);
});
