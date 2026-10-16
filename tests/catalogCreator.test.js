const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/lib/prisma");
const business = require("../dist/controllers/business.controller");
const geocoding = require("../dist/services/deliveryGeocoding.service");
const loyalty = require("../dist/services/loyalty.service");
const dispatch = require("../dist/services/autoDispatchPickupPlan.service");
const {
  createManualOrderController, createOrderController,
  createChatGPTOrderController, updateOrderDetailsController
} = require("../dist/controllers/order.controller");
const {
  listCatalogItemsController, searchItemsController, updateCatalogItemController
} = require("../dist/controllers/item.controller");
const { persistWebVerifiedCatalogItem } = require("../dist/services/productWebVerification.service");

const replaceForTest = (t, target, key, replacement) => {
  const original = target[key];
  target[key] = replacement;
  t.after(() => { target[key] = original; });
};

const body = {
  customerName: "Test Customer", customerPhone: "519-555-0100",
  customerEmail: "customer@example.com", addressLine1: "10 Industrial Dr",
  city: "Guelph", province: "Ontario", paymentMethod: "CASH",
  items: [{ name: "Example item", quantity: 1 }],
  // Spoofed values must never control audit attribution.
  createdByUserId: "someone-else", createdByName: "Someone else"
};
const response = () => ({
  status(code) { this.statusCode = code; return this; },
  json(value) { this.body = value; return this; }
});

const installOrderDatabase = (t, existingItem = null) => {
  const catalog = existingItem ? [{ ...existingItem }] : [];
  let order = {
    ...body, id: "order-1", orderStatus: "PLACED", items: [],
    createdByUserId: "original-order-author"
  };
  const customer = { id: "customer-1", recurringDriverNotes: null };
  const tx = {
    customer: {
      findFirst: async () => customer,
      update: async () => customer
    },
    order: {
      create: async ({ data }) => (order = { id: "order-1", ...data }),
      update: async ({ data }) => (order = { ...order, ...data }),
      findUniqueOrThrow: async () => ({ ...order, items: [] })
    },
    itemCatalog: {
      findFirst: async ({ where }) => catalog.find(item => item.normalizedName === where.normalizedName),
      create: async ({ data }) => {
        const item = { id: `item-${catalog.length + 1}`, pickupType: "OTHER", ...data };
        catalog.push(item);
        return item;
      }
    },
    orderItem: { create: async () => ({}), deleteMany: async () => ({ count: 1 }) }
  };
  replaceForTest(t, prisma, "$transaction", async callback => callback(tx));
  replaceForTest(t, prisma.customer, "findFirst", async () => customer);
  replaceForTest(t, prisma.order, "findUnique", async () => order);
  replaceForTest(t, business, "isBusinessConfirmedClosed", async () => false);
  replaceForTest(t, geocoding, "geocodeDeliveryAddress", async () => ({ geocodeStatus: "VERIFIED" }));
  replaceForTest(t, loyalty, "redeemFreeDeliveryRewardForOrder", async () => ({ customer, result: {} }));
  replaceForTest(t, loyalty, "sendCustomerLoyaltyNotification", async () => {});
  replaceForTest(t, dispatch, "autoDispatchCreatedOrderWithPickupPlan", async () => ({ dispatched: false }));
  return catalog;
};

for (const user of [
  { userId: "admin-1", role: "ADMIN" },
  { userId: "shannon-1", role: "DISPATCHER", firstName: " Shannon " },
  { userId: "paul-1", role: "DISPATCHER", firstName: "Paul", lastName: "Example" }
]) {
  test(`new manual-order items record the authenticated staff creator: ${user.userId}`, async t => {
    const catalog = installOrderDatabase(t);
    const res = response();
    await createManualOrderController({ body, user }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(catalog[0].createdByUserId, user.userId);
    assert.equal(catalog[0].createdByName, user.userId === "admin-1" ? "Admin" : user.userId === "shannon-1" ? "Shannon" : "Paul Example");
  });
}

for (const source of ["WEBFLOW", "ANDROID_APP", "IOS_APP", "CHATGPT"]) {
  test(`new ${source} customer items cannot claim a staff creator`, async t => {
    const catalog = installOrderDatabase(t);
    const res = response();
    const req = { body: { ...body, orderSource: source } };
    if (source === "CHATGPT") await createChatGPTOrderController(req, res, async () => {});
    else await createOrderController(req, res);
    assert.equal(res.statusCode, 201);
    assert.equal(catalog[0].createdByName, "Customer");
    assert.equal(catalog[0].createdByUserId, null);
  });
}

test("new items added while editing an order belong to its current editor", async t => {
  const catalog = installOrderDatabase(t);
  const res = response();
  await updateOrderDetailsController({
    params: { id: "order-1" }, body,
    user: { userId: "paul-1", role: "DISPATCHER", firstName: "Paul" }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(catalog[0].createdByUserId, "paul-1");
  assert.equal(catalog[0].createdByName, "Paul");
});

test("reordering and staff order edits preserve the original catalog creator", async t => {
  const original = { id: "item-1", normalizedName: "example item", createdByName: "Shannon", createdByUserId: "shannon-1" };
  const catalog = installOrderDatabase(t, original);
  await createOrderController({ body }, response());
  await updateOrderDetailsController({
    params: { id: "order-1" }, body,
    user: { userId: "paul-1", role: "DISPATCHER", firstName: "Paul" }
  }, response());
  assert.deepEqual(catalog, [original]);
});

test("catalog edits ignore attempted creator changes and staff lists retain attribution", async t => {
  const original = { id: "item-1", name: "Example item", createdByName: "Shannon", createdByUserId: "shannon-1" };
  replaceForTest(t, prisma.itemCatalog, "findUnique", async () => original);
  replaceForTest(t, prisma.itemCatalog, "update", async ({ data }) => {
    assert.equal(Object.hasOwn(data, "createdByName"), false);
    assert.equal(Object.hasOwn(data, "createdByUserId"), false);
    return { ...original, ...data };
  });
  const res = response();
  await updateCatalogItemController({ params: { id: "item-1" }, body: { name: "Corrected", createdByName: "Paul", createdByUserId: "paul-1" } }, res);
  assert.equal(res.body.item.createdByName, "Shannon");
  replaceForTest(t, prisma.itemCatalog, "count", async () => 2);
  replaceForTest(t, prisma.itemCatalog, "findMany", async () => [original, { id: "legacy", createdByName: null, createdByUserId: null }]);
  await listCatalogItemsController({ query: {} }, res);
  assert.equal(res.body.items[0].createdByName, "Shannon");
  assert.equal(res.body.items[1].createdByName, null);
});

test("public autocomplete does not select staff attribution fields", async t => {
  replaceForTest(t, prisma.itemCatalog, "findMany", async ({ select }) => {
    assert.equal(select.createdByName, undefined);
    assert.equal(select.createdByUserId, undefined);
    return [];
  });
  await searchItemsController({ query: { query: "example" } }, response());
});

test("customer AI product lookup attributes new entries and preserves existing creators", async t => {
  const verified = { name: "Example item", normalizedName: "example item", webVerificationUrl: "https://example.com/item", pickupType: "OTHER" };
  replaceForTest(t, prisma.itemCatalog, "findUnique", async () => null);
  let existing = null;
  replaceForTest(t, prisma.itemCatalog, "findFirst", async () => existing);
  replaceForTest(t, prisma.itemCatalog, "create", async ({ data }) => data);
  const created = await persistWebVerifiedCatalogItem(verified);
  assert.equal(created.createdByName, "Customer");
  assert.equal(created.createdByUserId, null);
  existing = { id: "item-1", createdByName: "Shannon", createdByUserId: "shannon-1", pickupType: "UNKNOWN" };
  replaceForTest(t, prisma.itemCatalog, "update", async ({ data }) => ({ ...existing, ...data }));
  const updated = await persistWebVerifiedCatalogItem(verified);
  assert.equal(updated.createdByName, "Shannon");
  assert.equal(updated.createdByUserId, "shannon-1");
});
