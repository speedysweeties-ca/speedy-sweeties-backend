const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const { OrderStatus } = require("@prisma/client");
const { prisma } = require("../dist/lib/prisma.js");
const {
  createOrderSubmissionFingerprint,
  preventDuplicatePublicOrderSubmission
} = require("../dist/middleware/orderDuplicateGuard.js");
const {
  isAllowedOrderStatusTransition,
  requireAllowedOrderStatusTransition
} = require("../dist/middleware/orderStatusTransitionGuard.js");
const {
  getCustomerFcmSettingKey,
  registerCustomerFcmTokenController
} = require("../dist/controllers/notification.controller.js");

const responseRecorder = () => {
  const listeners = new Map();
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
    },
    once(event, listener) {
      listeners.set(event, listener);
      return result;
    },
    emit(event) {
      const listener = listeners.get(event);
      if (listener) listener();
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

const sampleOrderBody = {
  customerName: "Test Customer",
  customerPhone: "519-555-0111",
  customerEmail: "test@example.com",
  addressLine1: "10 Test Street",
  city: "Guelph",
  province: "Ontario",
  paymentMethod: "CASH",
  additionalNotes: "Front door",
  items: [{ name: "Test Item", quantity: 1, unitPrice: 0 }]
};

test("public UUID tracking route is removed and token tracking remains", () => {
  const routeSource = fs.readFileSync("src/routes/orders.ts", "utf8");

  assert.equal(routeSource.includes('"/track/:id"'), false);
  assert.equal(routeSource.includes('"/track-token/:token"'), true);
  assert.equal(fs.existsSync("src/routes/order.routes.ts"), false);
});

test("duplicate fingerprint ignores FCM token changes", () => {
  const first = createOrderSubmissionFingerprint({
    ...sampleOrderBody,
    fcmToken: "first-token-value"
  });
  const second = createOrderSubmissionFingerprint({
    ...sampleOrderBody,
    fcmToken: "second-token-value"
  });

  assert.equal(first, second);
});

test("duplicate public order submission is rejected", async (t) => {
  replaceForTest(t, prisma, "$executeRaw", async () => 1);
  replaceForTest(t, prisma, "$queryRaw", async () => []);

  let nextCalled = false;
  const response = responseRecorder();

  await preventDuplicatePublicOrderSubmission(
    { body: sampleOrderBody },
    response,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, "DUPLICATE_ORDER_SUBMISSION");
});

test("successful reservation allows the first public order through", async (t) => {
  replaceForTest(t, prisma, "$executeRaw", async () => 1);
  replaceForTest(t, prisma, "$queryRaw", async () => [{ key: "reserved" }]);
  replaceForTest(t, prisma.systemSetting, "deleteMany", async () => ({ count: 1 }));

  let nextCalled = false;
  const response = responseRecorder();

  await preventDuplicatePublicOrderSubmission(
    { body: sampleOrderBody },
    response,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, true);
  assert.equal(response.statusCode, 200);
});

test("strict order lifecycle allows only adjacent forward transitions plus cancellation", () => {
  assert.equal(
    isAllowedOrderStatusTransition(OrderStatus.PLACED, OrderStatus.DISPATCHED),
    true
  );
  assert.equal(
    isAllowedOrderStatusTransition(OrderStatus.DISPATCHED, OrderStatus.ACCEPTED),
    true
  );
  assert.equal(
    isAllowedOrderStatusTransition(OrderStatus.ACCEPTED, OrderStatus.OUT_FOR_DELIVERY),
    true
  );
  assert.equal(
    isAllowedOrderStatusTransition(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED),
    true
  );
  assert.equal(
    isAllowedOrderStatusTransition(OrderStatus.ACCEPTED, OrderStatus.CANCELLED),
    true
  );
  assert.equal(
    isAllowedOrderStatusTransition(OrderStatus.PLACED, OrderStatus.DELIVERED),
    false
  );
  assert.equal(
    isAllowedOrderStatusTransition(OrderStatus.ACCEPTED, OrderStatus.DELIVERED),
    false
  );
  assert.equal(
    isAllowedOrderStatusTransition(OrderStatus.DELIVERED, OrderStatus.CANCELLED),
    false
  );
});

test("status transition middleware rejects a skipped status", async (t) => {
  replaceForTest(t, prisma.order, "findUnique", async () => ({
    orderStatus: OrderStatus.PLACED
  }));

  let nextCalled = false;
  const response = responseRecorder();

  await requireAllowedOrderStatusTransition(
    {
      params: { id: "order-1" },
      body: { orderStatus: OrderStatus.DELIVERED }
    },
    response,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, "INVALID_ORDER_STATUS_TRANSITION");
});

test("FCM registration persists the token without exposing it in the setting key", async (t) => {
  const upsertCalls = [];
  replaceForTest(t, prisma.systemSetting, "upsert", async (args) => {
    upsertCalls.push(args);
    return args.create;
  });

  const token = "fcm-token-value-that-is-long-enough-1234567890";
  const response = responseRecorder();

  await registerCustomerFcmTokenController(
    { body: { token } },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.message, "Token saved");
  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].create.value, token);
  assert.equal(upsertCalls[0].where.key, getCustomerFcmSettingKey(token));
  assert.equal(upsertCalls[0].where.key.includes(token), false);
});

test("FCM registration rejects invalid short tokens", async (t) => {
  let upsertCalled = false;
  replaceForTest(t, prisma.systemSetting, "upsert", async () => {
    upsertCalled = true;
  });

  const response = responseRecorder();

  await registerCustomerFcmTokenController(
    { body: { token: "short" } },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(upsertCalled, false);
});
