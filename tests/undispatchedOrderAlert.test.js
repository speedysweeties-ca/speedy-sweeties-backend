const assert = require("node:assert/strict");
const test = require("node:test");
const { OrderStatus } = require("@prisma/client");
const {
  processUndispatchedOrderAlerts,
  sendUndispatchedOrderAlertWithResend
} = require("../dist/services/undispatchedOrderAlert.service.js");

const createStore = (currentOrder) => {
  const calls = {
    claimed: [],
    markedSent: [],
    released: []
  };

  return {
    calls,
    store: {
      findCandidates: async () => [
        {
          id: currentOrder.id,
          orderNumber: currentOrder.orderNumber,
          createdAt: currentOrder.createdAt
        }
      ],
      claim: async (orderId) => {
        calls.claimed.push(orderId);
        return true;
      },
      getClaimedOrder: async () => currentOrder,
      markSent: async (orderId) => {
        calls.markedSent.push(orderId);
        return true;
      },
      release: async (orderId) => {
        calls.released.push(orderId);
      }
    }
  };
};

test("sends and records one alert for an eligible undispatched order", async () => {
  const now = new Date("2026-09-05T18:30:00.000Z");
  const currentOrder = {
    id: "order-123",
    orderNumber: 123,
    createdAt: new Date("2026-09-05T18:24:00.000Z"),
    orderStatus: OrderStatus.PLACED,
    dispatchedAt: null
  };
  const { store, calls } = createStore(currentOrder);
  const sent = [];

  const sentCount = await processUndispatchedOrderAlerts({
    store,
    now,
    sendAlert: async (order, waitingMinutes) => {
      sent.push({ order, waitingMinutes });
      return { id: "email-1" };
    }
  });

  assert.equal(sentCount, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].waitingMinutes, 6);
  assert.deepEqual(calls.claimed, ["order-123"]);
  assert.deepEqual(calls.markedSent, ["order-123"]);
  assert.deepEqual(calls.released, []);
});

test("does not email an order that was dispatched after candidate selection", async () => {
  const currentOrder = {
    id: "order-124",
    orderNumber: 124,
    createdAt: new Date("2026-09-05T18:20:00.000Z"),
    orderStatus: OrderStatus.DISPATCHED,
    dispatchedAt: new Date("2026-09-05T18:25:00.000Z")
  };
  const { store, calls } = createStore(currentOrder);
  let emailCount = 0;

  const sentCount = await processUndispatchedOrderAlerts({
    store,
    now: new Date("2026-09-05T18:30:00.000Z"),
    sendAlert: async () => {
      emailCount += 1;
      return { id: "should-not-send" };
    }
  });

  assert.equal(sentCount, 0);
  assert.equal(emailCount, 0);
  assert.deepEqual(calls.markedSent, []);
  assert.deepEqual(calls.released, ["order-124"]);
});

test("uses a restricted Resend request with an order-specific idempotency key", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return {
      ok: true,
      json: async () => ({ id: "email-2" })
    };
  };

  const result = await sendUndispatchedOrderAlertWithResend(
    {
      id: "order-125",
      orderNumber: 125,
      createdAt: new Date("2026-09-05T18:20:00.000Z")
    },
    5,
    {
      apiKey: "secret-test-key",
      from: "Speedy Sweeties Alerts <onboarding@resend.dev>",
      to: "rstubbings@hotmail.com",
      fetchImpl
    }
  );

  assert.equal(result.id, "email-2");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.resend.com/emails");
  assert.equal(
    requests[0].init.headers["Idempotency-Key"],
    "undispatched-order/order-125"
  );

  const body = JSON.parse(requests[0].init.body);
  assert.deepEqual(body.to, ["rstubbings@hotmail.com"]);
  assert.match(body.subject, /Order #125/);
  assert.match(body.text, /at least 5 minutes/);
  assert.doesNotMatch(body.text, /customer|address|phone/i);
});
