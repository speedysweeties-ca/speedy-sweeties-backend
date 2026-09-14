const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildOrderDraftResponse,
  combineRequestedNameAndPackage,
  extractOpenAiOutputText,
  findBestCatalogMatch,
  normalizeProductText
} = require("../dist/services/aiOrderDraft.service.js");

const catalogItem = (overrides = {}) => ({
  id: "catalog-1",
  name: "Crown Royal",
  normalizedName: "crown royal",
  brand: "Crown Royal",
  size: "750 mL",
  category: "Whisky",
  source: "LCBO",
  pickupType: "LCBO",
  popularityScore: 10,
  ...overrides
});

test("Canadian package slang normalizes for catalog matching", () => {
  assert.equal(
    normalizeProductText("a 26er of Crown Royal"),
    "a 750ml of crown royal"
  );

  const match = findBestCatalogMatch(
    "Crown Royal 26er",
    [catalogItem()]
  );

  assert.equal(match.id, "catalog-1");
});

test("package sizes stay in item names and package counts do not become quantities", () => {
  const response = buildOrderDraftResponse(
    {
      status: "READY",
      assistantMessage: "I prepared your draft.",
      clarificationQuestion: null,
      items: [
        {
          requestedName: "Smirnoff",
          packageDescription: "375 mL",
          quantity: 1,
          confidence: "HIGH"
        },
        {
          requestedName: "sativa pre-rolls",
          packageDescription: "10-pack",
          quantity: 1,
          confidence: "HIGH"
        }
      ],
      paymentMethod: null,
      additionalNotes: null
    },
    []
  );

  assert.equal(response.draft.items[0].requestedName, "Smirnoff — 375 mL");
  assert.equal(response.draft.items[0].quantity, 1);
  assert.equal(response.draft.items[1].requestedName, "sativa pre-rolls — 10-pack");
  assert.equal(response.draft.items[1].quantity, 1);
  assert.equal(response.draft.additionalNotes, null);
});

test("package details are not duplicated in completed item names", () => {
  assert.equal(
    combineRequestedNameAndPackage("Crown Royal 750 mL", "750 mL"),
    "Crown Royal 750 mL"
  );
});

test("ambiguous catalog candidates are not guessed", () => {
  const match = findBestCatalogMatch("Coke", [
    catalogItem({
      id: "coke-2l",
      name: "Coke",
      normalizedName: "coke",
      brand: "Coca-Cola",
      size: "2 L",
      category: "Pop",
      pickupType: "CONVENIENCE"
    }),
    catalogItem({
      id: "coke-case",
      name: "Coke",
      normalizedName: "coke",
      brand: "Coca-Cola",
      size: "24 pack",
      category: "Pop",
      pickupType: "CONVENIENCE"
    })
  ]);

  assert.equal(match, null);
});

test("weak catalog similarity is left for dispatcher review", () => {
  const response = buildOrderDraftResponse(
    {
      status: "READY",
      assistantMessage: "I prepared your draft.",
      clarificationQuestion: null,
      items: [
        {
          requestedName: "A very specific unknown vape",
          packageDescription: null,
          quantity: 1,
          confidence: "HIGH"
        }
      ],
      paymentMethod: "DEBIT",
      additionalNotes: null
    },
    [catalogItem()]
  );

  assert.equal(response.readyForReview, true);
  assert.equal(response.orderSubmitted, false);
  assert.equal(response.draft.items[0].catalogMatch, null);
  assert.equal(response.draft.items[0].needsDispatcherReview, true);
});

test("an empty model draft is forced back to clarification", () => {
  const response = buildOrderDraftResponse(
    {
      status: "READY",
      assistantMessage: "What can I get for you?",
      clarificationQuestion: null,
      items: [],
      paymentMethod: null,
      additionalNotes: null
    },
    []
  );

  assert.equal(response.status, "NEEDS_CLARIFICATION");
  assert.equal(response.readyForReview, false);
  assert.equal(
    response.clarificationQuestion,
    "What would you like Speedy Sweeties to deliver?"
  );
});

test("OpenAI Responses output text is extracted without SDK helpers", () => {
  const text = extractOpenAiOutputText({
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "{\"status\":\"READY\"}"
          }
        ]
      }
    ]
  });

  assert.equal(text, "{\"status\":\"READY\"}");
});
