const assert = require("node:assert/strict");
const test = require("node:test");

const { prisma } = require("../dist/lib/prisma.js");
const deliveryGeocodingService = require("../dist/services/deliveryGeocoding.service.js");
const businessController = require("../dist/controllers/business.controller.js");
const {
  createOrderController
} = require("../dist/controllers/order.controller.js");
const {
  updateCustomerController
} = require("../dist/controllers/customer.controller.js");

const firstOrderBody = {
  customerName: "Test Customer",
  customerPhone: "519-555-0100",
  customerEmail: "test@example.com",
  addressLine1: "10A Industrial Dr",
  unitNumber: "4B",
  buzzCode: "1234",
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

const responseRecorder = () => {
  const result = {
    statusCode: 200,
    body: undefined,
    status(code) {
      result.statusCode = code;
      return result;
    },
    json(body) {
      result.body = body;
      return result;
    }
  };

  return result;
};

const replaceForTest = (t, target, property, replacement) => {
  const original = target[property];
  target[property] = replacement;
  t.after(() => {
    target[property] = original;
  });
};

const verifiedLocation = {
  deliveryLatitude: 43.53,
  deliveryLongitude: -80.22,
  geocodeStatus: "VERIFIED",
  geocodedAddress: "10A Industrial Dr, Guelph, ON, Canada",
  geocodePlaceId: "test-place",
  geocodeAddressFingerprint: "test-fingerprint"
};

const needsReviewLocation = {
  ...verifiedLocation,
  deliveryLatitude: null,
  deliveryLongitude: null,
  geocodeStatus: "NEEDS_REVIEW",
  geocodedAddress: null,
  geocodePlaceId: null
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const installOrderCreationDatabase = (t, initialCustomer = null) => {
  const originalAutoDispatchSetting = process.env.AUTO_DISPATCH_ENABLED;
  process.env.AUTO_DISPATCH_ENABLED = "false";
  t.after(() => {
    if (originalAutoDispatchSetting === undefined) {
      delete process.env.AUTO_DISPATCH_ENABLED;
    } else {
      process.env.AUTO_DISPATCH_ENABLED = originalAutoDispatchSetting;
    }
  });

  let database = {
    customer: initialCustomer
      ? {
          loyaltyRewardBalance: initialCustomer.loyaltyFreeDelivery ? 1 : 0,
          ...clone(initialCustomer)
        }
      : null,
    orders: [],
    customerUpdates: []
  };

  replaceForTest(t, prisma.customer, "findFirst", async () => database.customer);
  replaceForTest(t, prisma, "$transaction", async (callback) => {
    const checkpoint = clone(database);
    const tx = {
      customer: {
        create: async ({ data }) => {
          database.customer = {
            id: "customer-1",
            recurringDriverNotes: null,
            loyaltyCompletedOrders: 0,
            loyaltyRewardsEarned: 0,
            loyaltyRewardsUsed: 0,
            loyaltyRewardBalance: 0,
            loyaltyFreeDelivery: false,
            ...data
          };
          return database.customer;
        },
        update: async ({ where, data }) => {
          assert.equal(where.id, database.customer.id);
          const {
            loyaltyRewardsUsed,
            loyaltyRewardBalance,
            ...customerData
          } = data;
          const updatedCustomer = {
            ...database.customer,
            ...customerData
          };
          if (loyaltyRewardsUsed !== undefined) {
            updatedCustomer.loyaltyRewardsUsed =
              loyaltyRewardsUsed && typeof loyaltyRewardsUsed === "object"
                ? database.customer.loyaltyRewardsUsed + loyaltyRewardsUsed.increment
                : loyaltyRewardsUsed;
          }
          if (loyaltyRewardBalance !== undefined) {
            updatedCustomer.loyaltyRewardBalance =
              loyaltyRewardBalance && typeof loyaltyRewardBalance === "object"
                ? database.customer.loyaltyRewardBalance + loyaltyRewardBalance.increment
                : loyaltyRewardBalance;
          }
          database.customer = updatedCustomer;
          database.customerUpdates.push({ where, data });
          return database.customer;
        }
      },
      order: {
        create: async ({ data }) => {
          const order = { id: `order-${database.orders.length + 1}`, ...data };
          database.orders.push(order);
          return order;
        },
        findUniqueOrThrow: async ({ where }) => ({
          ...database.orders.find((order) => order.id === where.id),
          items: [],
          assignedDriver: null
        })
      },
      itemCatalog: {
        findFirst: async () => ({ id: "catalog-item", pickupType: "OTHER" }),
        create: async () => ({ id: "catalog-item", pickupType: "OTHER" })
      },
      orderItem: {
        create: async () => ({ id: "order-item" })
      },
      systemSetting: {
        findUnique: async () => ({ value: "false" })
      }
      };
      tx.$queryRaw = async (_queryStrings, ...queryValues) =>
        queryValues.includes(database.customer?.id) ? [clone(database.customer)] : [];
      tx.customer.findUnique = async ({ where }) =>
        where.id === database.customer?.id ? database.customer : null;

    try {
      return await callback(tx);
    } catch (error) {
      database = checkpoint;
      throw error;
    }
  });

  return {
    get database() {
      return database;
    }
  };
};

test("NEEDS_REVIEW orders create or retain a customer and save the latest order address", async (t) => {
  const database = installOrderCreationDatabase(t);

  replaceForTest(t, businessController, "isBusinessConfirmedClosed", async () => false);
  let geocodedInput;
  replaceForTest(t, deliveryGeocodingService, "geocodeDeliveryAddress", async (input) => {
    geocodedInput = input;
    return needsReviewLocation;
  });

  const firstResponse = responseRecorder();
  await createOrderController({ body: firstOrderBody }, firstResponse);

  assert.equal(firstResponse.statusCode, 201);
  assert.equal(firstResponse.body.loyaltyAccessToken !== null, true);
  assert.equal(database.database.orders[0].customerId, "customer-1");
  assert.deepEqual(
    {
      addressLine1: database.database.customer.addressLine1,
      unitNumber: database.database.customer.unitNumber,
      buzzCode: database.database.customer.buzzCode,
      city: database.database.customer.city,
      province: database.database.customer.province
    },
    {
      addressLine1: "10A Industrial Dr",
      unitNumber: "4B",
      buzzCode: "1234",
      city: "Guelph",
      province: "Ontario"
    }
  );
  assert.deepEqual(geocodedInput, {
    addressLine1: "10A Industrial Dr",
    city: "Guelph",
    province: "Ontario"
  });

  database.database.customer.recurringDriverNotes = "Use the side entrance";
  database.database.customer.postalCode = "N1G 2W1";
  database.database.customer.notes = "Existing customer note";
  database.database.customer.createdAt = "2026-01-01T00:00:00.000Z";
  database.database.customer.loyaltyCompletedOrders = 7;
  database.database.customer.loyaltyRewardsEarned = 2;
  database.database.customer.loyaltyRewardsUsed = 1;
  database.database.customer.dispatcherNotes = "Prefers afternoon";

  const secondOrderBody = {
    ...firstOrderBody,
    addressLine1: "99 New Street",
    unitNumber: "12",
    buzzCode: "99",
    city: "Kitchener"
  };
  const secondResponse = responseRecorder();
  await createOrderController({ body: secondOrderBody }, secondResponse);

  assert.equal(secondResponse.statusCode, 201);
  assert.equal(secondResponse.body.loyaltyAccessToken !== null, true);
  assert.equal(database.database.orders[1].customerId, "customer-1");
  assert.deepEqual(
    {
      addressLine1: database.database.customer.addressLine1,
      unitNumber: database.database.customer.unitNumber,
      buzzCode: database.database.customer.buzzCode,
      city: database.database.customer.city,
      province: database.database.customer.province
    },
    {
      addressLine1: "99 New Street",
      unitNumber: "12",
      buzzCode: "99",
      city: "Kitchener",
      province: "Ontario"
    }
  );
  assert.equal(database.database.orders[0].addressLine1, "10A Industrial Dr");
  assert.equal(database.database.orders[0].unitNumber, "4B");
  assert.equal(database.database.orders[0].buzzCode, "1234");
  assert.equal(database.database.orders[0].city, "Guelph");
  assert.equal(database.database.orders[1].addressLine1, "99 New Street");
  assert.deepEqual(
    {
      addressLine1: database.database.customer.addressLine1,
      unitNumber: database.database.customer.unitNumber,
      buzzCode: database.database.customer.buzzCode,
      city: database.database.customer.city,
      province: database.database.customer.province
    },
    {
      addressLine1: database.database.orders[1].addressLine1,
      unitNumber: database.database.orders[1].unitNumber,
      buzzCode: database.database.orders[1].buzzCode,
      city: database.database.orders[1].city,
      province: database.database.orders[1].province
    }
  );
  assert.equal(database.database.customer.recurringDriverNotes, "Use the side entrance");
  assert.equal(database.database.customer.loyaltyCompletedOrders, 7);
  assert.equal(database.database.customer.loyaltyRewardsEarned, 2);
  assert.equal(database.database.customer.loyaltyRewardsUsed, 1);
  assert.equal(database.database.customer.dispatcherNotes, "Prefers afternoon");
  assert.equal(database.database.customer.postalCode, "N1G 2W1");
  assert.equal(database.database.customer.notes, "Existing customer note");
  assert.equal(database.database.customer.createdAt, "2026-01-01T00:00:00.000Z");
});

test("older clients do not erase saved unit or buzz-code details when fields are omitted", async (t) => {
  const database = installOrderCreationDatabase(t, {
    id: "customer-1",
    addressLine1: "10 Working Street",
    unitNumber: "8C",
    buzzCode: "2468",
    city: "Guelph",
    province: "Ontario",
    recurringDriverNotes: null,
    loyaltyFreeDelivery: false
  });
  replaceForTest(t, businessController, "isBusinessConfirmedClosed", async () => false);
  replaceForTest(t, deliveryGeocodingService, "geocodeDeliveryAddress", async () => needsReviewLocation);

  const legacyBody = { ...firstOrderBody };
  delete legacyBody.unitNumber;
  delete legacyBody.buzzCode;

  const response = responseRecorder();
  await createOrderController({ body: legacyBody }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(database.database.customer.unitNumber, "8C");
  assert.equal(database.database.customer.buzzCode, "2468");
  assert.equal(database.database.orders[0].unitNumber, null);
  assert.equal(database.database.orders[0].buzzCode, null);
});

test("iOS E_TRANSFER orders are stored with the Prisma ETRANSFER value", async (t) => {
  const database = installOrderCreationDatabase(t);

  replaceForTest(t, businessController, "isBusinessConfirmedClosed", async () => false);
  replaceForTest(t, deliveryGeocodingService, "geocodeDeliveryAddress", async () => needsReviewLocation);

  const response = responseRecorder();
  await createOrderController(
    {
      body: {
        ...firstOrderBody,
        paymentMethod: "E_TRANSFER"
      }
    },
    response
  );

  assert.equal(response.statusCode, 201);
  assert.equal(database.database.orders[0].paymentMethod, "ETRANSFER");
});

test("invalid and rejected orders do not overwrite a saved customer address", async (t) => {
  const database = installOrderCreationDatabase(t, {
    id: "customer-1",
    addressLine1: "10 Working Street",
    city: "Guelph",
    province: "Ontario",
    recurringDriverNotes: "Use the side entrance",
    loyaltyFreeDelivery: false
  });
  replaceForTest(t, businessController, "isBusinessConfirmedClosed", async () => true);
  replaceForTest(t, deliveryGeocodingService, "geocodeDeliveryAddress", async () => {
    throw new deliveryGeocodingService.DeliveryAddressValidationError(
      "Please select a valid delivery address."
    );
  });

  const closedResponse = responseRecorder();
  await createOrderController({ body: firstOrderBody }, closedResponse);
  assert.equal(closedResponse.statusCode, 409);
  assert.equal(database.database.customer.addressLine1, "10 Working Street");

  businessController.isBusinessConfirmedClosed = async () => false;
  const invalidAddressResponse = responseRecorder();
  await createOrderController({ body: firstOrderBody }, invalidAddressResponse);
  assert.equal(invalidAddressResponse.statusCode, 400);
  assert.equal(database.database.customer.addressLine1, "10 Working Street");
  assert.equal(database.database.customer.city, "Guelph");
});

test("NEEDS_REVIEW orders retain existing loyalty reward processing", async (t) => {
  const database = installOrderCreationDatabase(t, {
    id: "customer-1",
    addressLine1: "10 Working Street",
    city: "Guelph",
    province: "Ontario",
    loyaltyFreeDelivery: true,
    loyaltyRewardsUsed: 2
  });

  replaceForTest(t, businessController, "isBusinessConfirmedClosed", async () => false);
  replaceForTest(t, deliveryGeocodingService, "geocodeDeliveryAddress", async () => needsReviewLocation);

  const response = responseRecorder();
  await createOrderController(
    {
      body: {
        ...firstOrderBody,
        addressLine1: "99 New Street",
        orderSource: "ANDROID_APP"
      }
    },
    response
  );

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.loyaltyAccessToken !== null, true);
  assert.equal(database.database.orders[0].customerId, "customer-1");
  assert.equal(database.database.customer.addressLine1, "99 New Street");
  assert.equal(database.database.customer.loyaltyFreeDelivery, false);
  assert.equal(database.database.customer.loyaltyRewardsUsed, 3);
});

test("a transaction failure rolls back a customer address update", async (t) => {
  const database = installOrderCreationDatabase(t, {
    id: "customer-1",
    addressLine1: "10 Working Street",
    city: "Guelph",
    province: "Ontario",
    recurringDriverNotes: "Use the side entrance",
    loyaltyCompletedOrders: 4,
    loyaltyFreeDelivery: false
  });

  replaceForTest(t, businessController, "isBusinessConfirmedClosed", async () => false);
  replaceForTest(t, deliveryGeocodingService, "geocodeDeliveryAddress", async () => needsReviewLocation);
  replaceForTest(t, prisma, "$transaction", async (callback) => {
    const checkpoint = clone(database.database);
    const tx = {
      $queryRaw: async (_queryStrings, ...queryValues) =>
        queryValues.includes(database.database.customer?.id)
          ? [clone(database.database.customer)]
          : [],
      customer: {
        create: async () => {
          throw new Error("unexpected customer creation");
        },
        findUnique: async ({ where }) =>
          where.id === database.database.customer?.id
            ? database.database.customer
            : null,
        update: async ({ where, data }) => {
          assert.equal(where.id, database.database.customer.id);
          database.database.customer = { ...database.database.customer, ...data };
          database.database.customerUpdates.push({ where, data });
          return database.database.customer;
        }
      },
      order: {
        create: async ({ data }) => {
          const order = { id: "order-1", ...data };
          database.database.orders.push(order);
          return order;
        },
        findUniqueOrThrow: async () => {
          throw new Error("should not read a failed order");
        }
      },
      itemCatalog: {
        findFirst: async () => ({ id: "catalog-item", pickupType: "OTHER" }),
        create: async () => ({ id: "catalog-item", pickupType: "OTHER" })
      },
      orderItem: {
        create: async () => {
          throw new Error("simulated order item write failure");
        }
      },
      systemSetting: {
        findUnique: async () => ({ value: "false" })
      }
    };

    try {
      return await callback(tx);
    } catch (error) {
      database.database.customer = checkpoint.customer;
      database.database.orders = checkpoint.orders;
      database.database.customerUpdates = checkpoint.customerUpdates;
      throw error;
    }
  });

  await assert.rejects(
    createOrderController(
      {
        body: {
          ...firstOrderBody,
          addressLine1: "99 New Street"
        }
      },
      responseRecorder()
    ),
    /simulated order item write failure/
  );

  assert.equal(database.database.customer.addressLine1, "10 Working Street");
  assert.equal(database.database.customer.city, "Guelph");
  assert.equal(database.database.customer.recurringDriverNotes, "Use the side entrance");
  assert.equal(database.database.customer.loyaltyCompletedOrders, 4);
  assert.equal(database.database.orders.length, 0);
});

test("customer profile edits trim unit details and can clear a buzz code", async (t) => {
  const existingCustomer = {
    id: "customer-1",
    fullName: "Test Customer",
    phone: "519-555-0100",
    email: "test@example.com",
    addressLine1: "10A Industrial Dr",
    unitNumber: "4B",
    buzzCode: "1234",
    city: "Guelph",
    province: "Ontario",
    dispatcherNotes: null
  };
  replaceForTest(t, prisma.customer, "findUnique", async () => existingCustomer);

  let updateData;
  replaceForTest(t, prisma.customer, "update", async ({ data }) => {
    updateData = data;
    return { ...existingCustomer, ...data };
  });

  const response = responseRecorder();
  await updateCustomerController(
    {
      params: { id: "customer-1" },
      body: { unitNumber: "  8C  ", buzzCode: "" }
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(updateData.unitNumber, "8C");
  assert.equal(updateData.buzzCode, null);
  assert.equal(updateData.addressLine1, "10A Industrial Dr");
});

test("customer profile edits reject overlong access details", async (t) => {
  replaceForTest(t, prisma.customer, "findUnique", async () => ({
    id: "customer-1",
    fullName: "Test Customer",
    phone: "519-555-0100",
    email: "test@example.com",
    addressLine1: "10A Industrial Dr",
    unitNumber: null,
    buzzCode: null,
    city: "Guelph",
    province: "Ontario",
    dispatcherNotes: null
  }));

  let updateCalled = false;
  replaceForTest(t, prisma.customer, "update", async () => {
    updateCalled = true;
  });

  const response = responseRecorder();
  await updateCustomerController(
    {
      params: { id: "customer-1" },
      body: { unitNumber: "U".repeat(51) }
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(updateCalled, false);
});
