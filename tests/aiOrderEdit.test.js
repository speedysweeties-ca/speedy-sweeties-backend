const assert = require("node:assert/strict");
const test = require("node:test");
const { applyOrderEdit, orderEditSchema } = require("../dist/services/aiOrderEdit");
const { aiOrderDraftRequestSchema } = require("../dist/validators/aiOrderDraft.validator");

const cart = [{ name: "Smirnoff 750ml", quantity: 2 }, { name: "ice", quantity: 3 }];
const operation = (overrides = {}) => ({
  action: "UPDATE", index: 1, requestedName: null,
  packageDescription: null, quantity: 5, confidence: "HIGH", ...overrides
});
const edit = (operations, overrides = {}) => ({
  status: "READY", assistantMessage: "Draft updated.", clarificationQuestion: null,
  operations, paymentMethod: null, additionalNotes: null, ...overrides
});

test("five bags of ice keeps the two bottles of Smirnoff", () => {
  const result = applyOrderEdit(cart, orderEditSchema.parse(edit([operation()])));
  assert.deepEqual(result.items.map(({requestedName, quantity}) => ({requestedName, quantity})), [
    { requestedName: "Smirnoff 750ml", quantity: 2 },
    { requestedName: "ice", quantity: 5 }
  ]);
  assert.equal(cart[1].quantity, 3);
});

test("product edits with no quantity retain the customer's manual quantity", () => {
  const result = applyOrderEdit([{ name: "Smirnoff 750ml", quantity: 7 }], edit([
    operation({ index: 0, requestedName: "Crown Royal", packageDescription: "750 mL", quantity: null })
  ]));
  assert.equal(result.items[0].quantity, 7);
  assert.equal(result.items[0].requestedName, "Crown Royal");
});

test("explicit quantity one remains a valid change", () => {
  const result = applyOrderEdit(cart, edit([operation({ index: 0, quantity: 1 })]));
  assert.equal(result.items[0].quantity, 1);
  assert.equal(result.items[1].quantity, 3);
});

test("additions and removals preserve all unaffected rows", () => {
  const result = applyOrderEdit(cart, edit([
    operation({ action: "REMOVE", index: 1, quantity: null }),
    operation({ action: "ADD", index: null, requestedName: "Coke", quantity: 4 })
  ]));
  assert.deepEqual(result.items.map(i => i.quantity), [2, 4]);
  assert.equal(result.items[1].requestedName, "Coke");
});

test("invalid indexes, repeated updates, and incomplete additions ask for clarification", () => {
  for (const operations of [
    [operation({ index: 8 })],
    [operation(), operation()],
    [operation({ action: "ADD", index: null, requestedName: "Coke", quantity: null })],
    [operation({ requestedName: null, packageDescription: "1 L" })]
  ]) {
    const result = applyOrderEdit(cart, edit(operations));
    assert.equal(result.status, "NEEDS_CLARIFICATION");
    assert.deepEqual(result.items.map(i => i.quantity), [2, 3]);
  }
});

test("clarification never partially applies a proposed change", () => {
  const result = applyOrderEdit(cart, edit([operation()], {
    status: "NEEDS_CLARIFICATION", clarificationQuestion: "Which size?"
  }));
  assert.deepEqual(result.items.map(i => i.quantity), [2, 3]);
  assert.equal(result.clarificationQuestion, "Which size?");
});

test("request validation accepts old clients and rejects malformed cart snapshots", () => {
  assert.equal(aiOrderDraftRequestSchema.safeParse({body: {transcript: "ice"}}).success, true);
  assert.equal(aiOrderDraftRequestSchema.safeParse({body: {transcript: "five ice", currentCart: cart}}).success, true);
  for (const currentCart of [[{name: "ice", quantity: 0}], [{name: "", quantity: 2}], Array(26).fill(cart[0])]) {
    assert.equal(aiOrderDraftRequestSchema.safeParse({body: {transcript: "ice", currentCart}}).success, false);
  }
});

test("request sends the actual cart and the response preserves unaffected quantities", async (t) => {
  const { env } = require("../dist/config/env");
  const { createAiOrderDraft } = require("../dist/services/aiOrderDraft.service");
  const oldKey = env.OPENAI_API_KEY;
  const oldLookup = env.AI_PRODUCT_WEB_LOOKUP_ENABLED;
  env.OPENAI_API_KEY = "unit-test-only";
  env.AI_PRODUCT_WEB_LOOKUP_ENABLED = false;
  t.after(() => { env.OPENAI_API_KEY = oldKey; env.AI_PRODUCT_WEB_LOOKUP_ENABLED = oldLookup; });
  t.mock.method(global, "fetch", async (_url, options) => {
    const request = JSON.parse(options.body);
    const input = JSON.parse(request.input.at(-1).content);
    assert.deepEqual(input.currentCart, cart);
    assert.match(input.customerRequest, /keep the Smirnoff the same/);
    assert.ok(request.text.format.schema.properties.operations);
    return { ok: true, json: async () => ({output_text: JSON.stringify(edit([operation()]))}) };
  });
  const result = await createAiOrderDraft({
    transcript: "change my order to five bags of ice but keep the Smirnoff the same",
    history: [{role: "user", content: "to Smirnoff and three ice"}],
    currentCart: cart, catalogItems: []
  });
  assert.equal(result.readyForReview, true);
  assert.deepEqual(result.draft.items.map(i => i.quantity), [2, 5]);
  assert.equal(result.orderSubmitted, false);
});
