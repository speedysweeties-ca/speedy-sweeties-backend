const assert = require("node:assert/strict");
const test = require("node:test");

const { prisma } = require("../dist/lib/prisma.js");
const {
  listCatalogItemsController
} = require("../dist/controllers/item.controller.js");

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

const stubCatalogQueries = (t, total = 0, items = []) => {
  const countCalls = [];
  const findManyCalls = [];

  replaceForTest(t, prisma.itemCatalog, "count", async (args) => {
    countCalls.push(args);
    return total;
  });
  replaceForTest(t, prisma.itemCatalog, "findMany", async (args) => {
    findManyCalls.push(args);
    return items;
  });

  return { countCalls, findManyCalls };
};

test("catalog list preserves existing behavior when pickupType is omitted or blank", async (t) => {
  const { countCalls, findManyCalls } = stubCatalogQueries(t, 1, [{ id: "item-1" }]);

  const omittedResponse = responseRecorder();
  await listCatalogItemsController({ query: {} }, omittedResponse);

  assert.equal(omittedResponse.statusCode, 200);
  assert.deepEqual(countCalls[0].where, {});
  assert.deepEqual(findManyCalls[0].where, {});

  const blankResponse = responseRecorder();
  await listCatalogItemsController(
    { query: { pickupType: "   " } },
    blankResponse
  );

  assert.equal(blankResponse.statusCode, 200);
  assert.deepEqual(countCalls[1].where, {});
  assert.deepEqual(findManyCalls[1].where, {});
});

test("catalog list filters UNKNOWN items and applies filtered pagination totals", async (t) => {
  const { countCalls, findManyCalls } = stubCatalogQueries(t, 60, [{ id: "unknown-1" }]);
  const response = responseRecorder();

  await listCatalogItemsController(
    { query: { pickupType: "UNKNOWN", page: "2", limit: "25" } },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(countCalls[0].where, { pickupType: "UNKNOWN" });
  assert.deepEqual(findManyCalls[0].where, { pickupType: "UNKNOWN" });
  assert.equal(findManyCalls[0].skip, 25);
  assert.equal(findManyCalls[0].take, 25);
  assert.equal(response.body.total, 60);
  assert.equal(response.body.totalPages, 3);
  assert.equal(response.body.page, 2);
});

test("catalog list combines Pickup Type with text search and active status", async (t) => {
  const { countCalls, findManyCalls } = stubCatalogQueries(t);
  const response = responseRecorder();

  await listCatalogItemsController(
    {
      query: {
        pickupType: "convenience",
        query: "Coke",
        isActive: "true"
      }
    },
    response
  );

  const where = countCalls[0].where;
  assert.equal(response.statusCode, 200);
  assert.equal(where.pickupType, "CONVENIENCE");
  assert.equal(where.isActive, true);
  assert.equal(where.OR[0].normalizedName.contains, "coke");
  assert.equal(where.OR[2].brand.contains, "Coke");
  assert.deepEqual(findManyCalls[0].where, where);
});

test("catalog list rejects invalid Pickup Type filters without querying the catalog", async (t) => {
  const { countCalls, findManyCalls } = stubCatalogQueries(t);
  const response = responseRecorder();

  await listCatalogItemsController(
    { query: { pickupType: "NOT_A_PICKUP_TYPE" } },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    success: false,
    message: "Invalid pickup type"
  });
  assert.equal(countCalls.length, 0);
  assert.equal(findManyCalls.length, 0);
});