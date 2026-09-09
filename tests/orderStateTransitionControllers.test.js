const assert = require("node:assert/strict");
const test = require("node:test");
const { OrderStatus, UserRole } = require("@prisma/client");
const { messaging } = require("../dist/config/firebase.js");
const { prisma } = require("../dist/lib/prisma.js");
const {
  driverActionController
} = require("../dist/controllers/driverAction.controller.js");
const {
  createOrUpdateReceiptController
} = require("../dist/controllers/receipt.controller.js");
const {
  updateOrderStatusController
} = require("../dist/controllers/order.controller.js");

const replaceForTest = (t, target, property, replacement) => {
  const original = target[property];
  target[property] = replacement;
  t.after(() => {
    target[property] = original;
  });
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

const clone = (value) =>
  value === null || value === undefined
    ? value
    : structuredClone(value);

const currentTorontoMonth = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year").value}-${
    parts.find((part) => part.type === "month").value}`;
};

const order = (overrides = {}) => ({
  id: "order-1",
  orderNumber: 101,
  orderStatus: OrderStatus.ACCEPTED,
  assignedDriverId: "driver-1",
  assignedAt: new Date("2026-09-09T12:00:00.000Z"),
  dispatchedAt: new Date("2026-09-09T12:00:00.000Z"),
  acceptedAt: new Date("2026-09-09T12:05:00.000Z"),
  outForDeliveryAt: null,
  deliveredAt: null,
  cancelledAt: null,
  cancelledFromStatus: null,
  cancellationReason: null,
  customerName: "Test Customer",
  addressLine1: "10 Test Street",
  city: "Guelph",
  fcmToken: "customer-token",
  customerId: null,
  items: [],
  assignedDriver: null,
  dispatchedBy: null,
  ...overrides
});

const receipt = (overrides = {}) => ({
  id: "receipt-1",
  orderId: "order-1",
  receiptNumber: "SS-101",
  createdByDriverId: "driver-1",
  itemTotal: 10,
  deliveryCharge: 5,
  taxOrFees: 1.95,
  grandTotal: 16.95,
  notes: null,
  ...overrides
});

const driverRequest = (action) => ({
  params: { id: "order-1" },
  body: { action },
  user: {
    userId: "driver-1",
    email: "driver@example.com",
    role: UserRole.DRIVER
  }
});

const receiptRequest = () => ({
  params: { id: "order-1" },
  body: {
    itemTotal: 10,
    deliveryCharge: 5,
    taxOrFees: 1.95,
    grandTotal: 16.95,
    notes: "Leave at door"
  },
  user: {
    userId: "driver-1",
    role: UserRole.DRIVER
  }
});

const installTransitionHarness = (t, options = {}) => {
  let currentOrder = clone(options.order ?? order());
  let currentReceipt = clone(options.receipt ?? null);
  let updateAttempts = 0;
  let receiptUpserts = 0;
  let notificationCount = 0;
  let loyaltyUpdateCount = 0;
  let currentCustomer = currentOrder.customerId
    ? {
        id: currentOrder.customerId,
        recurringDriverNotes: null,
        loyaltyCompletedOrders: 0,
        loyaltyProgressMonth: currentTorontoMonth(),
        loyaltyRewardsEarned: 0,
        loyaltyRewardsUsed: 0,
        loyaltyRewardBalance: 0,
        loyaltyFreeDelivery: false
      }
    : null;
  let rootReadCount = 0;
  let releaseInitialReads;
  const initialReadsReady = new Promise((resolve) => {
    releaseInitialReads = resolve;
  });

  replaceForTest(t, messaging, "send", async () => {
    notificationCount += 1;
    return `message-${notificationCount}`;
  });
  replaceForTest(t, prisma.order, "findUnique", async ({ where }) => {
    rootReadCount += 1;
    if (
      options.waitForInitialOrderReads &&
      rootReadCount <= options.waitForInitialOrderReads
    ) {
      if (rootReadCount === options.waitForInitialOrderReads) {
        releaseInitialReads();
      }
      await initialReadsReady;
    }
    return where.id === currentOrder?.id ? clone(currentOrder) : null;
  });
  replaceForTest(t, prisma.order, "findUniqueOrThrow", async ({ where }) => {
    if (where.id !== currentOrder?.id) throw new Error("Order not found");
    return clone(currentOrder);
  });
  replaceForTest(t, prisma.order, "updateMany", async ({ where, data }) => {
    updateAttempts += 1;
    if (
      !currentOrder ||
      where.id !== currentOrder.id ||
      (where.assignedDriverId !== undefined &&
        where.assignedDriverId !== currentOrder.assignedDriverId) ||
      (where.orderStatus !== undefined &&
        where.orderStatus !== currentOrder.orderStatus)
    ) {
      return { count: 0 };
    }

    currentOrder = { ...currentOrder, ...clone(data) };
    return { count: 1 };
  });
  replaceForTest(t, prisma.digitalReceipt, "findUnique", async ({ where }) =>
    where.orderId === currentReceipt?.orderId ? clone(currentReceipt) : null
  );
  replaceForTest(t, prisma, "$transaction", async (callback) => {
    const transactionOrderBefore = clone(currentOrder);
    const transactionReceiptBefore = clone(currentReceipt);
    const tx = {
      $queryRaw: async (_queryStrings, ...queryValues) => {
        if (queryValues.includes(currentCustomer?.id)) {
          return [clone(currentCustomer)];
        }
        const orderId = queryValues.find(
          (value) => typeof value === "string" && value === currentOrder?.id
        );
        const driverId = queryValues.find(
          (value) => typeof value === "string" && value === "driver-1"
        );
        if (!orderId || (driverId && currentOrder.assignedDriverId !== driverId)) {
          return [];
        }
        return [clone(currentOrder)];
      },
      order: {
        findUnique: async ({ where }) =>
          where.id === currentOrder?.id ? clone(currentOrder) : null,
        update: async ({ where, data }) => {
          if (options.failReceiptOrderUpdate) {
            throw new Error("simulated order transition failure");
          }
          if (where.id !== currentOrder?.id) throw new Error("Order not found");
          currentOrder = { ...currentOrder, ...clone(data) };
          return {
            id: currentOrder.id,
            orderStatus: currentOrder.orderStatus,
            outForDeliveryAt: currentOrder.outForDeliveryAt
          };
        }
      },
      digitalReceipt: {
        upsert: async ({ where, update, create }) => {
          receiptUpserts += 1;
          currentReceipt = currentReceipt
            ? { ...currentReceipt, ...clone(update) }
            : { id: "receipt-created", ...clone(create) };
          return clone(currentReceipt);
        }
      },
      customer: {
        findUnique: async () =>
          currentCustomer ? clone(currentCustomer) : null,
        update: async ({ where, data }) => {
          if (where.id !== currentCustomer?.id) throw new Error("Customer not found");
          loyaltyUpdateCount += 1;
          const nextCustomer = { ...currentCustomer, ...clone(data) };
          if (data.loyaltyRewardsEarned?.increment) {
            nextCustomer.loyaltyRewardsEarned += data.loyaltyRewardsEarned.increment;
          }
          if (data.loyaltyRewardsUsed?.increment) {
            nextCustomer.loyaltyRewardsUsed += data.loyaltyRewardsUsed.increment;
          }
          if (data.loyaltyRewardBalance?.increment) {
            nextCustomer.loyaltyRewardBalance += data.loyaltyRewardBalance.increment;
          }
          currentCustomer = nextCustomer;
          return clone(currentCustomer);
        }
      }
    };

    try {
      return await callback(tx);
    } catch (error) {
      currentOrder = transactionOrderBefore;
      currentReceipt = transactionReceiptBefore;
      throw error;
    }
  });

  return {
    getOrder: () => clone(currentOrder),
    getReceipt: () => clone(currentReceipt),
    getUpdateAttempts: () => updateAttempts,
    getReceiptUpserts: () => receiptUpserts,
    getNotificationCount: () => notificationCount,
    getLoyaltyUpdateCount: () => loyaltyUpdateCount
  };
};

test("driver pickup is rejected without a receipt and succeeds with the Android action contract", async (t) => {
  const noReceiptHarness = installTransitionHarness(t, { receipt: null });
  const noReceiptResponse = responseRecorder();
  await driverActionController(driverRequest("OUT_FOR_DELIVERY"), noReceiptResponse);

  assert.equal(noReceiptResponse.statusCode, 409);
  assert.equal(noReceiptResponse.body.code, "RECEIPT_REQUIRED");
  assert.equal(noReceiptHarness.getOrder().orderStatus, OrderStatus.ACCEPTED);

  const receiptHarness = installTransitionHarness(t, { receipt: receipt() });
  const pickupResponse = responseRecorder();
  await driverActionController(driverRequest("OUT_FOR_DELIVERY"), pickupResponse);

  assert.equal(pickupResponse.statusCode, 200);
  assert.equal(pickupResponse.body.success, true);
  assert.equal(pickupResponse.body.order.orderStatus, OrderStatus.OUT_FOR_DELIVERY);
  assert.ok(receiptHarness.getOrder().outForDeliveryAt);
  assert.equal(receiptHarness.getNotificationCount(), 1);
});

test("driver acceptance follows the normal route and skipped driver actions return a stable conflict", async (t) => {
  const acceptanceHarness = installTransitionHarness(t, {
    order: order({
      orderStatus: OrderStatus.DISPATCHED,
      acceptedAt: null
    })
  });
  const acceptanceResponse = responseRecorder();
  await driverActionController(driverRequest("ACCEPTED"), acceptanceResponse);

  assert.equal(acceptanceResponse.statusCode, 200);
  assert.equal(acceptanceResponse.body.order.orderStatus, OrderStatus.ACCEPTED);
  assert.ok(acceptanceHarness.getOrder().acceptedAt);

  const skippedHarness = installTransitionHarness(t, {
    order: order({ orderStatus: OrderStatus.DISPATCHED }),
    receipt: receipt()
  });
  const skippedResponse = responseRecorder();
  await driverActionController(driverRequest("OUT_FOR_DELIVERY"), skippedResponse);

  assert.equal(skippedResponse.statusCode, 409);
  assert.equal(skippedResponse.body.code, "INVALID_ORDER_TRANSITION");
  assert.equal(skippedHarness.getOrder().orderStatus, OrderStatus.DISPATCHED);
});

test("receipt save atomically creates the receipt and transitions an accepted order once", async (t) => {
  const harness = installTransitionHarness(t, { receipt: null });
  const response = responseRecorder();
  await createOrUpdateReceiptController(receiptRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.order.orderStatus, OrderStatus.OUT_FOR_DELIVERY);
  assert.equal(harness.getReceiptUpserts(), 1);
  assert.equal(harness.getReceipt().orderId, "order-1");
  assert.ok(harness.getOrder().outForDeliveryAt);
  assert.equal(harness.getNotificationCount(), 1);
});

test("receipt transaction failure rolls back both receipt creation and pickup transition", async (t) => {
  const harness = installTransitionHarness(t, {
    receipt: null,
    failReceiptOrderUpdate: true
  });

  await assert.rejects(
    createOrUpdateReceiptController(receiptRequest(), responseRecorder()),
    /simulated order transition failure/
  );

  assert.equal(harness.getOrder().orderStatus, OrderStatus.ACCEPTED);
  assert.equal(harness.getReceipt(), null);
});

test("driver delivery requires a receipt and only transitions from OUT_FOR_DELIVERY", async (t) => {
  const noReceiptHarness = installTransitionHarness(t, {
    order: order({ orderStatus: OrderStatus.OUT_FOR_DELIVERY, acceptedAt: new Date() }),
    receipt: null
  });
  const noReceiptResponse = responseRecorder();
  await driverActionController(driverRequest("DELIVERED"), noReceiptResponse);

  assert.equal(noReceiptResponse.statusCode, 409);
  assert.equal(noReceiptResponse.body.code, "RECEIPT_REQUIRED");
  assert.equal(noReceiptHarness.getOrder().orderStatus, OrderStatus.OUT_FOR_DELIVERY);

  const deliveredHarness = installTransitionHarness(t, {
    order: order({
      orderStatus: OrderStatus.OUT_FOR_DELIVERY,
      acceptedAt: new Date(),
      outForDeliveryAt: new Date(),
      customerId: "customer-1",
      fcmToken: null
    }),
    receipt: receipt()
  });
  const deliveredResponse = responseRecorder();
  await driverActionController(driverRequest("DELIVERED"), deliveredResponse);

  assert.equal(deliveredResponse.statusCode, 200);
  assert.equal(deliveredResponse.body.order.orderStatus, OrderStatus.DELIVERED);
  assert.ok(deliveredHarness.getOrder().deliveredAt);
  assert.equal(deliveredHarness.getLoyaltyUpdateCount(), 1);
});

test("concurrent pickup requests produce one transition and one notification", async (t) => {
  const harness = installTransitionHarness(t, {
    receipt: receipt(),
    waitForInitialOrderReads: 2
  });
  const firstResponse = responseRecorder();
  const secondResponse = responseRecorder();

  await Promise.all([
    driverActionController(driverRequest("OUT_FOR_DELIVERY"), firstResponse),
    driverActionController(driverRequest("OUT_FOR_DELIVERY"), secondResponse)
  ]);

  assert.deepEqual(
    [firstResponse.statusCode, secondResponse.statusCode].sort(),
    [200, 409]
  );
  assert.equal(harness.getOrder().orderStatus, OrderStatus.OUT_FOR_DELIVERY);
  assert.equal(harness.getUpdateAttempts(), 2);
  assert.equal(harness.getNotificationCount(), 1);
});

test("concurrent delivery requests produce one transition and one loyalty completion", async (t) => {
  const harness = installTransitionHarness(t, {
    order: order({
      orderStatus: OrderStatus.OUT_FOR_DELIVERY,
      outForDeliveryAt: new Date(),
      customerId: "customer-1",
      fcmToken: null
    }),
    receipt: receipt(),
    waitForInitialOrderReads: 2
  });
  const firstResponse = responseRecorder();
  const secondResponse = responseRecorder();

  await Promise.all([
    driverActionController(driverRequest("DELIVERED"), firstResponse),
    driverActionController(driverRequest("DELIVERED"), secondResponse)
  ]);

  assert.deepEqual(
    [firstResponse.statusCode, secondResponse.statusCode].sort(),
    [200, 409]
  );
  assert.equal(harness.getOrder().orderStatus, OrderStatus.DELIVERED);
  assert.equal(harness.getLoyaltyUpdateCount(), 1);
});

test("terminal statuses and unauthorized drivers cannot use driver actions", async (t) => {
  const deliveredHarness = installTransitionHarness(t, {
    order: order({ orderStatus: OrderStatus.DELIVERED, deliveredAt: new Date() }),
    receipt: receipt()
  });
  const deliveredResponse = responseRecorder();
  await driverActionController(driverRequest("DELIVERED"), deliveredResponse);

  assert.equal(deliveredResponse.statusCode, 409);
  assert.equal(deliveredResponse.body.code, "INVALID_ORDER_TRANSITION");
  assert.equal(deliveredHarness.getOrder().deliveredAt instanceof Date, true);

  const ownershipHarness = installTransitionHarness(t, { receipt: receipt() });
  const unauthorizedResponse = responseRecorder();
  await driverActionController(
    {
      ...driverRequest("OUT_FOR_DELIVERY"),
      user: { userId: "driver-2", role: UserRole.DRIVER }
    },
    unauthorizedResponse
  );

  assert.equal(unauthorizedResponse.statusCode, 403);
  assert.equal(ownershipHarness.getOrder().orderStatus, OrderStatus.ACCEPTED);
});

test("staff cancellation remains available only from approved non-terminal stages", async (t) => {
  const harness = installTransitionHarness(t, {
    order: order({ orderStatus: OrderStatus.ACCEPTED })
  });
  const request = {
    params: { id: "order-1" },
    body: {
      orderStatus: OrderStatus.CANCELLED,
      cancellationReason: "Customer requested cancellation"
    },
    user: { userId: "dispatcher-1", role: UserRole.DISPATCHER }
  };
  const cancellationResponse = responseRecorder();
  await updateOrderStatusController(request, cancellationResponse);

  assert.equal(cancellationResponse.statusCode, 200);
  assert.equal(harness.getOrder().orderStatus, OrderStatus.CANCELLED);
  assert.equal(harness.getOrder().cancelledFromStatus, OrderStatus.ACCEPTED);
  assert.equal(harness.getOrder().cancellationReason, "Customer requested cancellation");

  const repeatedResponse = responseRecorder();
  await updateOrderStatusController(request, repeatedResponse);
  assert.equal(repeatedResponse.statusCode, 409);
  assert.equal(repeatedResponse.body.code, "INVALID_ORDER_TRANSITION");

  const normalStatusResponse = responseRecorder();
  await updateOrderStatusController(
    {
      ...request,
      body: { orderStatus: OrderStatus.ACCEPTED }
    },
    normalStatusResponse
  );
  assert.equal(normalStatusResponse.statusCode, 409);
  assert.equal(normalStatusResponse.body.code, "INVALID_ORDER_TRANSITION");
});

test("delivered orders cannot be cancelled and drivers cannot invoke the staff cancellation handler", async (t) => {
  const deliveredHarness = installTransitionHarness(t, {
    order: order({ orderStatus: OrderStatus.DELIVERED, deliveredAt: new Date() })
  });
  const cancellationRequest = {
    params: { id: "order-1" },
    body: { orderStatus: OrderStatus.CANCELLED },
    user: { userId: "dispatcher-1", role: UserRole.DISPATCHER }
  };
  const deliveredResponse = responseRecorder();
  await updateOrderStatusController(cancellationRequest, deliveredResponse);

  assert.equal(deliveredResponse.statusCode, 409);
  assert.equal(deliveredResponse.body.code, "INVALID_ORDER_TRANSITION");
  assert.equal(deliveredHarness.getOrder().orderStatus, OrderStatus.DELIVERED);

  const ownershipHarness = installTransitionHarness(t, {});
  const driverResponse = responseRecorder();
  await updateOrderStatusController(
    {
      ...cancellationRequest,
      user: { userId: "driver-1", role: UserRole.DRIVER }
    },
    driverResponse
  );
  assert.equal(driverResponse.statusCode, 403);
  assert.equal(ownershipHarness.getOrder().orderStatus, OrderStatus.ACCEPTED);
});
