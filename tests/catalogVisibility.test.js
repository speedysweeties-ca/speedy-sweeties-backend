const assert = require("node:assert/strict");
const test = require("node:test");
const { prisma } = require("../dist/lib/prisma.js");
const { env } = require("../dist/config/env.js");
const { searchItemsController, listCatalogItemsController } = require("../dist/controllers/item.controller.js");
const { createAiOrderDraftController } = require("../dist/controllers/aiOrderDraft.controller.js");
const draftService = require("../dist/services/aiOrderDraft.service.js");
const verificationService = require("../dist/services/productWebVerification.service.js");

const replaceForTest = (t, target, property, replacement) => {
  const original = target[property];
  target[property] = replacement;
  t.after(() => { target[property] = original; });
};

const responseRecorder = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  set() { return this; },
  json(body) { this.body = body; return this; }
});

const item = (id, pickupType, isActive = true) => ({
  id, name: `Example ${id}`, normalizedName: `example ${id}`,
  brand: null, size: null, category: null, source: null,
  pickupType, isActive, popularityScore: 1
});

// Emulate the relevant Prisma predicates so a missing query filter exposes the
// hidden fixtures. Apply the limit after filtering, as the database does.
const catalogFixture = (t) => {
  const items = [
    ...Array.from({ length: 12 }, (_, i) => item(`uncategorized-${i}`, "UNKNOWN")),
    item("blank", ""), item("invalid", "OTHER"),
    item("inactive", "CONVENIENCE", false),
    ...["CONVENIENCE", "BEER_STORE", "BROTHERS_BREWING", "LCBO", "VAPE", "DISPENSARY"].map(type => item(type, type))
  ];
  const matches = (row, where) =>
    (where.isActive === undefined || row.isActive === where.isActive) &&
    (where.pickupType === undefined ||
      (typeof where.pickupType === "string" ? row.pickupType === where.pickupType : where.pickupType.in.includes(row.pickupType)));
  replaceForTest(t, prisma.itemCatalog, "findMany", async ({ where, take }) => items.filter(row => matches(row, where)).slice(0, take));
  replaceForTest(t, prisma.itemCatalog, "count", async ({ where }) => items.filter(row => matches(row, where)).length);
  return items;
};

test("search hides uncategorized items before limiting and reveals them after categorization", async t => {
  const items = catalogFixture(t);
  const search = async () => {
    const res = responseRecorder();
    await searchItemsController({ query: { query: "Example", pickupType: "UNKNOWN", includeUnknown: "true" } }, res);
    assert.equal(res.statusCode, 200);
    return res.body;
  };
  assert.deepEqual((await search()).items.map(row => row.id), ["CONVENIENCE", "BEER_STORE", "BROTHERS_BREWING", "LCBO", "VAPE", "DISPENSARY"]);
  items[0].pickupType = "CONVENIENCE";
  assert.equal((await search()).items.some(row => row.id === items[0].id), true);
  items[0].pickupType = "UNKNOWN";
  assert.equal((await search()).items.some(row => row.id === items[0].id), false);

  const admin = responseRecorder();
  await listCatalogItemsController({ query: { pickupType: "UNKNOWN" } }, admin);
  assert.equal(admin.body.total, 12);
  assert.equal(admin.body.items.every(row => row.pickupType === "UNKNOWN"), true);
});

test("AI controller supplies only active categorized catalog entries", async t => {
  catalogFixture(t);
  let received;
  t.mock.method(draftService, "createAiOrderDraft", async input => {
    received = input;
    return { status: "READY", items: [] };
  });
  const res = responseRecorder();
  await createAiOrderDraftController({ body: { transcript: "Example" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(received.catalogItems.length, 6);
  assert.equal(received.catalogItems.some(row => ["UNKNOWN", "", "OTHER"].includes(row.pickupType) || !row.isActive), false);
});

test("AI excludes uncategorized input and previously verified items from catalog matches", async t => {
  const oldKey = env.OPENAI_API_KEY;
  env.OPENAI_API_KEY = "synthetic-test-key";
  t.after(() => { env.OPENAI_API_KEY = oldKey; });
  const hidden = { ...item("uncategorized", "UNKNOWN"), name: "Unsorted Paper Towels", normalizedName: "unsorted paper towels" };
  const visible = { ...item("categorized", "CONVENIENCE"), name: "Sparkling Water", normalizedName: "sparkling water" };
  let instructions;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    instructions = JSON.parse(options.body).instructions;
    return { ok: true, json: async () => ({ output_text: JSON.stringify({
      status: "READY", assistantMessage: "Please review your items.", clarificationQuestion: null,
      items: [hidden, visible].map(row => ({ requestedName: row.name, packageDescription: null, quantity: 1, confidence: "HIGH" })),
      paymentMethod: null, additionalNotes: null
    }) }) };
  });
  t.mock.method(verificationService, "verifyAndPersistRequestedProducts", async () => [hidden]);
  const result = await draftService.createAiOrderDraft({ transcript: hidden.name, history: [], catalogItems: [hidden, visible] });
  assert.equal(instructions.includes(hidden.name), false);
  assert.equal(instructions.includes(visible.name), true);
  assert.equal(result.draft.items[0].catalogMatch, null);
  assert.equal(result.draft.items[0].needsDispatcherReview, true);
  assert.equal(result.draft.items[1].catalogMatch.id, visible.id);
});
