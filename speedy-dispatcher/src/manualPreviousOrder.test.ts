import assert from "node:assert/strict";
import test from "node:test";
import { getPreviousOrderFields } from "./manualPreviousOrder.ts";

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
