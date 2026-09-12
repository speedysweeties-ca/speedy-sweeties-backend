const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const { OrderStatus, PaymentMethod, UserRole } = require("@prisma/client");
const { prisma } = require("../dist/lib/prisma.js");
const {
  createOrderSubmissionFingerprint,
  preventDuplicatePublicOrderSubmission
} = require("../dist/middleware/orderDuplicateGuard.js");
const {
  assignDriverToOrderController
} = require("../dist/controllers/orderAssignment.controller.js");
const {
  createOrderSchema,
  updateOrderDetailsSchema
} = require("../dist/validators/order.validator.js");
const {
  normalizePaymentMethod
} = require("../dist/utils/paymentMethod.js");

const sampleOrderBody = {
  customerName: "Test Customer",
  customerPhone: "519-555-0111",
  customerEmail: "test@example.com",
  addressLine1: "10 Test Street",
  city: "Guelph",
  province: "Ontario",
  paymentMethod: "CASH",
  additionalNotes: "Front door",
  items: [
    { name: "Test Item", quantity: 1, unitPrice: 10, totalPrice: 10 }
  ],
  subtotal: 10,
  deliveryFee: 5,
  tax: 1.95,
  tip: 0,
  discount: 0,
  total: 16.95
};

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

const assignmentRequest = (driverId) => ({
  params: { id: "order-1" },
  body: { driverId },
  user: { userId: "dispatcher-1", role: UserRole.DISPATCHER }
});

const existingOrder = {
  id: "order-1",
  orderStatus: OrderStatus.PLACED,
  assignedDriverId: null,
  assignedAt: null,
  dispatchedAt: null,
  assignedDriver: null
};

const driver = (overrides = {}) => ({
  id: "driver-1",
  firstName: "Test",
  lastName: "Driver",
  email: "driver@example.com",
  role: UserRole.DRIVER,
  isActive: true,
  isOnline: true,
  lastSeenAt: new Date(),
  driverFcmToken: null,
  driverAppState: "FOREGROUND",
  ...overrides
});

test("iOS E_TRANSFER payment values validate and normalize to ETRANSFER", () => {
  const createResult = createOrderSchema.safeParse({
    body: { ...sampleOrderBody, paymentMethod: "E_TRANSFER" }
  });
  const updateResult = updateOrderDetailsSchema.safeParse({
    params: { id: "order-1" },
    body: {
      customerName: sampleOrderBody.customerName,
      customerPhone: sampleOrderBody.customerPhone,
      customerEmail: sampleOrderBody.customerEmail,
      addressLine1: sampleOrderBody.addressLine1,
      city: sampleOrderBody.city,
      province: sampleOrderBody.province,
      paymentMethod: "E_TRANSFER",
      items: sampleOrderBody.items
    }
  });

  assert.equal(createResult.success, true);
  assert.equal(updateResult.success, true);
  assert.equal(normalizePaymentMethod("E_TRANSFER"), PaymentMethod.ETRANSFER);
  assert.equal(normalizePaymentMethod(PaymentMethod.CASH), PaymentMethod.CASH);
});

test("duplicate fingerprint ignores FCM changes and payment alias spelling", () => {
  const first = createOrderSubmissionFingerprint({
    ...sampleOrderBody,
    paymentMethod: "E_TRANSFER",
    fcmToken: "first-token-value"
  });
  const second = createOrderSubmissionFingerprint({
    ...sampleOrderBody,
    paymentMethod: "ETRANSFER",
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

test("failed public orders release their duplicate reservation", async (t) => {
  replaceForTest(t, prisma, "$executeRaw", async () => 1);
  replaceForTest(t, prisma, "$queryRaw", async () => [{ key: "reserved" }]);

  let releaseReservation;
  const reservationReleased = new Promise((resolve) => {
    releaseReservation = resolve;
  });
  replaceForTest(t, prisma.systemSetting, "deleteMany", async (args) => {
    releaseReservation(args);
    return { count: 1 };
  });

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
  response.statusCode = 400;
  response.emit("finish");

  const releaseArgs = await reservationReleased;
  assert.match(releaseArgs.where.key, /^orderSubmission:/);
});

test("duplicate guard is mounted only on public order creation", () => {
  const routeSource = fs.readFileSync("src/routes/orders.ts", "utf8");
  const publicRouteStart = routeSource.indexOf("// ✅ PUBLIC — customers create orders");
  const manualRouteStart = routeSource.indexOf("// 🔒 STAFF — manual order creation");
  const trackingRouteStart = routeSource.indexOf("// ✅ PUBLIC — customer tracking");
  const publicRoute = routeSource.slice(publicRouteStart, manualRouteStart);
  const manualRoute = routeSource.slice(manualRouteStart, trackingRouteStart);

  assert.equal(
    publicRoute.includes("preventDuplicatePublicOrderSubmission"),
    true
  );
  assert.equal(
    manualRoute.includes("preventDuplicatePublicOrderSubmission"),
    false
  );
});

test("manual assignment rejects a stale driver", async (t) => {
  replaceForTest(t, prisma.order, "findUnique", async () => existingOrder);
  replaceForTest(
    t,
    prisma.user,
    "findFirst",
    async () => driver({ lastSeenAt: new Date(Date.now() - 61 * 60 * 1000) })
  );

  let updateCalled = false;
  replaceForTest(t, prisma.order, "updateMany", async () => {
    updateCalled = true;
    return { count: 1 };
  });

  const response = responseRecorder();
  await assignDriverToOrderController(assignmentRequest("driver-1"), response);

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, "DRIVER_NOT_ONLINE");
  assert.equal(updateCalled, false);
});

test("manual assignment rejects an offline driver with a fresh heartbeat", async (t) => {
  replaceForTest(t, prisma.order, "findUnique", async () => existingOrder);
  replaceForTest(
    t,
    prisma.user,
    "findFirst",
    async () => driver({ isOnline: false })
  );

  let updateCalled = false;
  replaceForTest(t, prisma.order, "updateMany", async () => {
    updateCalled = true;
    return { count: 1 };
  });

  const response = responseRecorder();
  await assignDriverToOrderController(assignmentRequest("driver-1"), response);

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, "DRIVER_NOT_ONLINE");
  assert.equal(updateCalled, false);
});

test("manual assignment still accepts an online driver with a fresh heartbeat", async (t) => {
  replaceForTest(t, prisma.order, "findUnique", async () => existingOrder);
  replaceForTest(t, prisma.user, "findFirst", async () => driver());

  let assignmentData;
  replaceForTest(t, prisma.order, "updateMany", async ({ data }) => {
    assignmentData = data;
    return { count: 1 };
  });
  replaceForTest(t, prisma.orderPickupStop, "deleteMany", async () => ({
    count: 0
  }));
  let dispatchEventData;
  replaceForTest(t, prisma.dispatchEvent, "create", async ({ data }) => {
    dispatchEventData = data;
    return { id: "dispatch-event-1", ...data };
  });
  replaceForTest(t, prisma.order, "findUniqueOrThrow", async () => ({
    ...existingOrder,
    assignedDriverId: "driver-1",
    orderStatus: OrderStatus.DISPATCHED,
    orderNumber: 101,
    customerName: "Test Customer",
    addressLine1: "10 Test Street",
    city: "Guelph",
    items: [],
    assignedDriver: driver(),
    dispatchedBy: { firstName: "Test", lastName: "Dispatcher" }
  }));

  const response = responseRecorder();
  await assignDriverToOrderController(assignmentRequest("driver-1"), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.message, "Driver assigned successfully");
  assert.equal(assignmentData.assignedDriverId, "driver-1");
  assert.equal(assignmentData.orderStatus, OrderStatus.DISPATCHED);
  assert.equal(dispatchEventData.eventType, "ASSIGNED");
  assert.equal(dispatchEventData.actorUserId, "dispatcher-1");
  assert.equal(dispatchEventData.toDriverId, "driver-1");
});
