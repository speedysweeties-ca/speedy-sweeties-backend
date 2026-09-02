const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createOrderSchema,
  updateOrderDetailsSchema
} = require("../dist/validators/order.validator.js");

const createOrderBody = {
  customerName: "Test Customer",
  customerPhone: "519-555-0100",
  customerEmail: "test@example.com",
  addressLine1: "10A Industrial Dr",
  city: "Guelph",
  province: "Ontario",
  items: [
    { name: "Test item", quantity: 1, unitPrice: 10, totalPrice: 10 }
  ],
  subtotal: 10,
  deliveryFee: 5,
  tax: 1.95,
  tip: 0,
  discount: 0,
  total: 16.95,
  paymentMethod: "CASH"
};

test("order creation validation accepts a complete address without postalCode", () => {
  const parsed = createOrderSchema.safeParse({ body: createOrderBody });

  assert.equal(parsed.success, true);
});

test("order creation validation ignores a supplied invalid postalCode", () => {
  const parsed = createOrderSchema.safeParse({
    body: { ...createOrderBody, postalCode: "definitely-wrong" }
  });

  assert.equal(parsed.success, true);
  assert.equal(Object.hasOwn(parsed.data.body, "postalCode"), false);
});

test("order edit validation does not require or validate postalCode", () => {
  const parsed = updateOrderDetailsSchema.safeParse({
    params: { id: "order-1" },
    body: {
      customerName: createOrderBody.customerName,
      customerPhone: createOrderBody.customerPhone,
      customerEmail: createOrderBody.customerEmail,
      addressLine1: createOrderBody.addressLine1,
      city: createOrderBody.city,
      province: createOrderBody.province,
      postalCode: "not-used",
      additionalNotes: null,
      paymentMethod: createOrderBody.paymentMethod,
      items: createOrderBody.items
    }
  });

  assert.equal(parsed.success, true);
  assert.equal(Object.hasOwn(parsed.data.body, "postalCode"), false);
});
