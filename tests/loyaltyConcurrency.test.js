const assert = require("node:assert/strict");
const test = require("node:test");

const { messaging } = require("../dist/config/firebase.js");
const { prisma } = require("../dist/lib/prisma.js");
const {
  getCustomerLoyaltyController
} = require("../dist/controllers/customer.controller.js");
const {
  getCurrentLoyaltyMonth,
  recordDeliveredOrderLoyalty,
  redeemFreeDeliveryRewardForOrder,
  sendCustomerLoyaltyNotification
} = require("../dist/services/loyalty.service.js");

const clone = (value) => structuredClone(value);

const replaceForTest = (t, target, property, replacement) => {
  const original = target[property];
  target[property] = replacement;
  t.after(() => {
    target[property] = original;
  });
};

const responseRecorder = () => {
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(body) {
      response.body = body;
      return response;
    }
  };
  return response;
};

const customer = (overrides = {}) => ({
  id: "customer-1",
  recurringDriverNotes: null,
  loyaltyCompletedOrders: 0,
  loyaltyProgressMonth: "2026-09",
  loyaltyRewardsEarned: 0,
  loyaltyRewardsUsed: 0,
  loyaltyRewardBalance: 0,
  loyaltyFreeDelivery: false,
  ...overrides
});

const installLoyaltyDatabase = (t, initialCustomers) => {
  let customers = new Map(
    initialCustomers.map((entry) => [entry.id, clone(entry)])
  );
  const waitersByCustomerId = new Map();
  const lockedCustomerIds = new Set();
  const notifications = [];
  let committedTransactions = 0;

  const acquireCustomerLock = async (customerId) => {
    if (!lockedCustomerIds.has(customerId)) {
      lockedCustomerIds.add(customerId);
      return;
    }

    await new Promise((resolve) => {
      const waiters = waitersByCustomerId.get(customerId) ?? [];
      waiters.push(resolve);
      waitersByCustomerId.set(customerId, waiters);
    });
  };

  const releaseCustomerLock = (customerId) => {
    const waiters = waitersByCustomerId.get(customerId) ?? [];
    const next = waiters.shift();
    if (next) {
      waitersByCustomerId.set(customerId, waiters);
      next();
      return;
    }
    lockedCustomerIds.delete(customerId);
  };

  replaceForTest(t, prisma, "$transaction", async (callback) => {
    const checkpoint = clone([...customers.entries()]);
    const transactionLocks = new Set();
    const tx = {
      $queryRaw: async (_queryStrings, ...queryValues) => {
        const customerId = queryValues.find(
          (value) => typeof value === "string" && customers.has(value)
        );
        if (!customerId) return [];

        if (!transactionLocks.has(customerId)) {
          await acquireCustomerLock(customerId);
          transactionLocks.add(customerId);
        }
        return [{ id: customerId }];
      },
      customer: {
        findUnique: async ({ where }) => {
          const current = customers.get(where.id);
          return current ? clone(current) : null;
        },
        update: async ({ where, data }) => {
          const current = customers.get(where.id);
          if (!current) throw new Error("Customer not found");

          const updated = { ...current };
          for (const [field, value] of Object.entries(data)) {
            updated[field] =
              value && typeof value === "object" && "increment" in value
                ? updated[field] + value.increment
                : value;
          }
          customers.set(where.id, updated);
          return clone(updated);
        }
      }
    };

    try {
      const result = await callback(tx);
      committedTransactions += 1;
      return result;
    } catch (error) {
      customers = new Map(checkpoint);
      throw error;
    } finally {
      transactionLocks.forEach(releaseCustomerLock);
    }
  });

  replaceForTest(t, messaging, "send", async (payload) => {
    assert.ok(committedTransactions > 0, "notifications must be sent after transaction commit");
    notifications.push(payload);
    return `notification-${notifications.length}`;
  });

  return {
    getCustomer: (id = "customer-1") => clone(customers.get(id)),
    getNotifications: () => clone(notifications),
    getCommittedTransactions: () => committedTransactions
  };
};

test("two simultaneous orders consume one reward exactly once and notify once after commit", async (t) => {
  const database = installLoyaltyDatabase(t, [
    customer({ loyaltyRewardBalance: 1, loyaltyFreeDelivery: true })
  ]);

  const attempts = await Promise.all(
    ["first", "second"].map(async () => {
      const redemption = await prisma.$transaction((tx) =>
        redeemFreeDeliveryRewardForOrder(tx, "customer-1")
      );
      await sendCustomerLoyaltyNotification("customer-token", redemption.result);
      return redemption.result;
    })
  );

  assert.equal(attempts.filter((result) => result.rewardRedeemed).length, 1);
  assert.equal(database.getCustomer().loyaltyRewardBalance, 0);
  assert.equal(database.getCustomer().loyaltyRewardsUsed, 1);
  assert.equal(database.getCustomer().loyaltyFreeDelivery, false);
  assert.equal(
    database
      .getNotifications()
      .filter((payload) => payload.data.type === "LOYALTY_REWARD_APPLIED").length,
    1
  );
  assert.equal(database.getCommittedTransactions(), 2);
});

test("a rolled-back order transaction leaves its reward available and schedules no notification", async (t) => {
  const database = installLoyaltyDatabase(t, [
    customer({ loyaltyRewardBalance: 1, loyaltyFreeDelivery: true })
  ]);

  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const redemption = await redeemFreeDeliveryRewardForOrder(tx, "customer-1");
      assert.equal(redemption.result.rewardRedeemed, true);
      throw new Error("simulated order creation failure");
    }),
    /simulated order creation failure/
  );

  assert.equal(database.getCustomer().loyaltyRewardBalance, 1);
  assert.equal(database.getCustomer().loyaltyRewardsUsed, 0);
  assert.equal(database.getCustomer().loyaltyFreeDelivery, true);
  assert.deepEqual(database.getNotifications(), []);
});

test("two completed deliveries for one customer serialize to the correct ten-order reward", async (t) => {
  const database = installLoyaltyDatabase(t, [
    customer({ loyaltyCompletedOrders: 8 })
  ]);

  const results = await Promise.all([
    recordDeliveredOrderLoyalty("customer-1", new Date("2026-09-15T12:00:00.000Z")),
    recordDeliveredOrderLoyalty("customer-1", new Date("2026-09-15T12:00:00.000Z"))
  ]);

  assert.equal(results.filter((result) => result.progressIncreased).length, 2);
  assert.equal(results.filter((result) => result.rewardEarned).length, 1);
  assert.equal(database.getCustomer().loyaltyCompletedOrders, 0);
  assert.equal(database.getCustomer().loyaltyRewardsEarned, 1);
  assert.equal(database.getCustomer().loyaltyRewardBalance, 1);
  assert.equal(database.getCustomer().loyaltyFreeDelivery, true);
});

test("the tenth delivery earns exactly one reward and its notification is post-commit", async (t) => {
  const database = installLoyaltyDatabase(t, [
    customer({ loyaltyCompletedOrders: 9 })
  ]);

  const result = await recordDeliveredOrderLoyalty(
    "customer-1",
    new Date("2026-09-15T12:00:00.000Z")
  );
  await sendCustomerLoyaltyNotification("customer-token", result);

  assert.equal(result.rewardEarned, true);
  assert.equal(database.getCustomer().loyaltyRewardsEarned, 1);
  assert.equal(database.getCustomer().loyaltyRewardBalance, 1);
  assert.equal(
    database
      .getNotifications()
      .filter((payload) => payload.data.type === "LOYALTY_REWARD_EARNED").length,
    1
  );
});

test("month reset and delivery use the Toronto month of the locked decision", async (t) => {
  const database = installLoyaltyDatabase(t, [
    customer({ loyaltyCompletedOrders: 8, loyaltyProgressMonth: "2026-09" })
  ]);

  const september = new Date("2026-10-01T03:59:59.999Z"); // Sep 30 in Toronto
  const october = new Date("2026-10-01T04:00:00.000Z"); // Oct 1 in Toronto
  assert.equal(getCurrentLoyaltyMonth(september), "2026-09");
  assert.equal(getCurrentLoyaltyMonth(october), "2026-10");

  await Promise.all([
    recordDeliveredOrderLoyalty("customer-1", september),
    recordDeliveredOrderLoyalty("customer-1", october)
  ]);

  assert.equal(database.getCustomer().loyaltyProgressMonth, "2026-10");
  assert.equal(database.getCustomer().loyaltyCompletedOrders, 1);
});

test("two customers update independently and an accumulated second reward remains available", async (t) => {
  const database = installLoyaltyDatabase(t, [
    customer({ id: "customer-1", loyaltyCompletedOrders: 8 }),
    customer({ id: "customer-2", loyaltyRewardBalance: 2, loyaltyFreeDelivery: true })
  ]);

  const [delivery, redemption] = await Promise.all([
    recordDeliveredOrderLoyalty("customer-1", new Date("2026-09-15T12:00:00.000Z")),
    prisma.$transaction((tx) => redeemFreeDeliveryRewardForOrder(tx, "customer-2"))
  ]);

  assert.equal(delivery.completedOrders, 9);
  assert.equal(redemption.result.rewardRedeemed, true);
  assert.equal(database.getCustomer("customer-1").loyaltyCompletedOrders, 9);
  assert.equal(database.getCustomer("customer-2").loyaltyRewardBalance, 1);
  assert.equal(database.getCustomer("customer-2").loyaltyFreeDelivery, true);
});

test("customer loyalty API preserves its existing response fields after a locked reset", async (t) => {
  const database = installLoyaltyDatabase(t, [
    customer({ loyaltyCompletedOrders: 6, loyaltyProgressMonth: "2026-08" })
  ]);
  replaceForTest(t, prisma.customer, "findFirst", async () => ({ id: "customer-1" }));

  const response = responseRecorder();
  await getCustomerLoyaltyController(
    { query: { phone: "519-555-0100" } },
    response
  );

  assert.deepEqual(
    response.body.loyalty,
    {
      loyaltyCompletedOrders: 0,
      loyaltyRewardsEarned: 0,
      loyaltyRewardsUsed: 0,
      loyaltyFreeDelivery: false,
      deliveriesRemaining: 10
    }
  );
  assert.equal(response.body.success, true);
  assert.equal(response.body.found, true);
  assert.equal(database.getCustomer().loyaltyProgressMonth, getCurrentLoyaltyMonth());
});
