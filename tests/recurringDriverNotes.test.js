const assert = require("node:assert/strict");
const test = require("node:test");

const {
  combineOrderNotes,
  persistSubmittedRecurringDriverNotes,
  resolveRecurringDriverNotes
} = require("../dist/services/recurringDriverNotes.service.js");
const {
  createManualOrderSchema,
  createOrderSchema
} = require("../dist/validators/order.validator.js");
const { prisma } = require("../dist/lib/prisma.js");
const deliveryGeocodingService = require("../dist/services/deliveryGeocoding.service.js");
const businessController = require("../dist/controllers/business.controller.js");
const {
  dispatcherCustomerLookupSelect
} = require("../dist/controllers/customer.controller.js");
const {
  driverOrderInclude,
  withDriverRoutingPlan
} = require("../dist/controllers/driverOrders.controller.js");
const {
  createManualOrderController,
  createOrderController
} = require("../dist/controllers/order.controller.js");

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

test("authenticated manual validation accepts recurring notes while public validation strips them", () => {
  const requestBody = {
    ...createOrderBody,
    recurringDriverNotes: "$10 distance charge"
  };
  const manualResult = createManualOrderSchema.safeParse({ body: requestBody });
  const publicResult = createOrderSchema.safeParse({ body: requestBody });

  assert.equal(manualResult.success, true);
  assert.equal(manualResult.data.body.recurringDriverNotes, "$10 distance charge");
  assert.equal(publicResult.success, true);
  assert.equal(Object.hasOwn(publicResult.data.body, "recurringDriverNotes"), false);
});

test("manual creation atomically snapshots and persists against the resolved customer while public creation ignores the field", async (t) => {
  const existingCustomer = {
    id: "resolved-customer",
    recurringDriverNotes: "Old recurring note",
    loyaltyFreeDelivery: false
  };
  const customerUpdates = [];
  const createdOrders = [];
  let customerToResolve = existingCustomer;
  let failOrderCreation = false;

  replaceForTest(
    t,
    deliveryGeocodingService,
    "geocodeDeliveryAddress",
    async () => ({
      deliveryLatitude: 43.53,
      deliveryLongitude: -80.22,
      geocodeStatus: "VERIFIED",
      geocodedAddress: "10A Industrial Dr, Guelph, ON, Canada",
      geocodePlaceId: "test-place",
      geocodeAddressFingerprint: "test-fingerprint"
    })
  );
  replaceForTest(
    t,
    businessController,
    "isBusinessConfirmedClosed",
    async () => false
  );
  replaceForTest(
    t,
    prisma.customer,
    "findFirst",
    async () => customerToResolve
  );
  replaceForTest(
    t,
    prisma,
    "$transaction",
    async (callback) => {
      const pendingCustomerUpdates = [];
      let createdOrder;
      const tx = {
        customer: {
          create: async ({ data }) => ({
            ...existingCustomer,
            ...data,
            id: "newly-created-customer",
            recurringDriverNotes: null
          }),
          update: async (args) => {
            pendingCustomerUpdates.push(args);
            return existingCustomer;
          }
        },
        order: {
          create: async ({ data }) => {
            if (failOrderCreation) throw new Error("simulated order failure");
            createdOrder = { id: `order-${createdOrders.length + 1}`, ...data };
            return createdOrder;
          },
          findUniqueOrThrow: async () => ({
            ...createdOrder,
            items: [],
            assignedDriver: null
          })
        },
        itemCatalog: {
          findFirst: async () => ({
            id: "catalog-item",
            pickupType: "OTHER"
          }),
          create: async () => ({
            id: "catalog-item",
            pickupType: "OTHER"
          })
        },
        orderItem: {
          create: async () => ({ id: "order-item" })
        },
        systemSetting: {
          findUnique: async () => ({ value: "false" })
        }
      };

      const result = await callback(tx);
      customerUpdates.push(...pendingCustomerUpdates);
      createdOrders.push(createdOrder);
      return result;
    }
  );

  const manualResponse = responseRecorder();
  await createManualOrderController(
    {
      body: {
        ...createOrderBody,
        additionalNotes: "Leave at side door",
        recurringDriverNotes: "$10 distance charge"
      }
    },
    manualResponse
  );

  assert.equal(manualResponse.statusCode, 201);
  assert.equal(createdOrders[0].customerId, "resolved-customer");
  assert.equal(
    createdOrders[0].additionalNotes,
    "$10 distance charge | Leave at side door"
  );
  assert.deepEqual(customerUpdates[0], {
    where: { id: "resolved-customer" },
    data: {
      addressLine1: "10A Industrial Dr",
      city: "Guelph",
      province: "Ontario"
    }
  });
  assert.deepEqual(customerUpdates[1], {
    where: { id: "resolved-customer" },
    data: { recurringDriverNotes: "$10 distance charge" }
  });

  customerToResolve = null;
  const newCustomerResponse = responseRecorder();
  await createManualOrderController(
    {
      body: {
        ...createOrderBody,
        recurringDriverNotes: "New customer note"
      }
    },
    newCustomerResponse
  );

  assert.equal(newCustomerResponse.statusCode, 201);
  assert.equal(createdOrders[1].customerId, "newly-created-customer");
  assert.deepEqual(customerUpdates[2], {
    where: { id: "newly-created-customer" },
    data: {
      addressLine1: "10A Industrial Dr",
      city: "Guelph",
      province: "Ontario"
    }
  });
  assert.deepEqual(customerUpdates[3], {
    where: { id: "newly-created-customer" },
    data: { recurringDriverNotes: "New customer note" }
  });

  customerToResolve = existingCustomer;
  const publicResponse = responseRecorder();
  await createOrderController(
    {
      body: {
        ...createOrderBody,
        additionalNotes: "Public order note",
        recurringDriverNotes: "Attempted public change"
      }
    },
    publicResponse
  );

  assert.equal(publicResponse.statusCode, 201);
  assert.equal(createdOrders[2].additionalNotes, "Public order note");
  assert.equal(customerUpdates.length, 5);
  assert.deepEqual(customerUpdates[4], {
    where: { id: "resolved-customer" },
    data: {
      addressLine1: "10A Industrial Dr",
      city: "Guelph",
      province: "Ontario"
    }
  });

  failOrderCreation = true;
  await assert.rejects(
    createManualOrderController(
      {
        body: {
          ...createOrderBody,
          recurringDriverNotes: "Must not persist"
        }
      },
      responseRecorder()
    ),
    /simulated order failure/
  );
  assert.equal(customerUpdates.length, 5);
});

test("existing notes are snapshotted when an older dispatcher omits the field without scheduling an update", () => {
  const plan = resolveRecurringDriverNotes({
    isManualOrder: true,
    submitted: false,
    submittedValue: undefined,
    storedValue: "$10 distance charge"
  });

  assert.deepEqual(plan, {
    snapshot: "$10 distance charge",
    customerUpdate: undefined
  });
});

test("new and existing customers receive a trimmed recurring note on successful persistence", async () => {
  for (const customerId of ["new-customer", "existing-customer"]) {
    const calls = [];
    const writer = {
      customer: {
        update: async (args) => calls.push(args)
      }
    };
    const plan = resolveRecurringDriverNotes({
      isManualOrder: true,
      submitted: true,
      submittedValue: "  $10 distance charge  ",
      storedValue: customerId === "existing-customer" ? "Old note" : null
    });

    await persistSubmittedRecurringDriverNotes(
      writer,
      customerId,
      plan.customerUpdate
    );

    assert.deepEqual(calls, [
      {
        where: { id: customerId },
        data: { recurringDriverNotes: "$10 distance charge" }
      }
    ]);
  }
});

test("recurring and order-specific notes are combined once with the established separator", () => {
  assert.equal(
    combineOrderNotes([
      " $10 distance charge ",
      "Leave at side door",
      "$10 distance charge"
    ], true),
    "$10 distance charge | Leave at side door"
  );
});

test("public-order note aliases retain their existing duplicate combination behavior", () => {
  assert.equal(
    combineOrderNotes(["Same public note", "Same public note"]),
    "Same public note | Same public note"
  );
});

test("clearing a submitted recurring note persists null and leaves only order-specific notes", async () => {
  const calls = [];
  const plan = resolveRecurringDriverNotes({
    isManualOrder: true,
    submitted: true,
    submittedValue: "   ",
    storedValue: "$10 distance charge"
  });

  await persistSubmittedRecurringDriverNotes(
    { customer: { update: async (args) => calls.push(args) } },
    "customer-1",
    plan.customerUpdate
  );

  assert.equal(plan.snapshot, null);
  assert.deepEqual(calls[0].data, { recurringDriverNotes: null });
  assert.equal(combineOrderNotes([plan.snapshot, "One-time note"]), "One-time note");
});

test("omitted, public, failed, or cancelled workflows do not perform a customer-note write", async () => {
  const calls = [];
  const writer = {
    customer: {
      update: async (args) => calls.push(args)
    }
  };
  const omitted = resolveRecurringDriverNotes({
    isManualOrder: true,
    submitted: false,
    submittedValue: undefined,
    storedValue: "Saved note"
  });
  const publicRequest = resolveRecurringDriverNotes({
    isManualOrder: false,
    submitted: true,
    submittedValue: "Attempted public change",
    storedValue: "Saved note"
  });

  await persistSubmittedRecurringDriverNotes(
    writer,
    "customer-1",
    omitted.customerUpdate
  );
  await persistSubmittedRecurringDriverNotes(
    writer,
    "customer-1",
    publicRequest.customerUpdate
  );

  // Failed and cancelled forms never reach the successful transaction write.
  assert.deepEqual(calls, []);
  assert.equal(publicRequest.snapshot, null);
});

test("historical order snapshots do not change when the customer note changes", () => {
  const firstPlan = resolveRecurringDriverNotes({
    isManualOrder: true,
    submitted: true,
    submittedValue: "Original recurring note",
    storedValue: null
  });
  const historicalAdditionalNotes = combineOrderNotes([
    firstPlan.snapshot,
    "Original order note"
  ]);
  const laterPlan = resolveRecurringDriverNotes({
    isManualOrder: true,
    submitted: true,
    submittedValue: "Changed recurring note",
    storedValue: firstPlan.snapshot
  });

  assert.equal(
    historicalAdditionalNotes,
    "Original recurring note | Original order note"
  );
  assert.equal(laterPlan.snapshot, "Changed recurring note");
  assert.equal(
    historicalAdditionalNotes,
    "Original recurring note | Original order note"
  );
});

test("authenticated dispatcher customer lookup selects recurring driver notes", () => {
  assert.equal(dispatcherCustomerLookupSelect.recurringDriverNotes, true);
});

test("driver order responses retain additionalNotes and exclude customer-only notes", () => {
  const responseOrder = withDriverRoutingPlan(
    {
      id: "order-1",
      additionalNotes: "$10 distance charge | Leave at side door"
    },
    { pickupRequired: true }
  );

  assert.equal(driverOrderInclude.customer, undefined);
  assert.equal(
    responseOrder.additionalNotes,
    "$10 distance charge | Leave at side door"
  );
  assert.equal(Object.hasOwn(responseOrder, "dispatcherNotes"), false);
  assert.equal(Object.hasOwn(responseOrder, "recurringDriverNotes"), false);
});
