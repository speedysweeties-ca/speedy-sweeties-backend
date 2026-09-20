const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildCatalogReference,
  buildOrderDraftResponse,
  consolidateModelOrderItems,
  combineRequestedNameAndPackage,
  extractExplicitDeliveryInstructions,
  extractOpenAiOutputText,
  findBestCatalogMatch,
  findUnmatchedRequestedNames,
  normalizeLikelySpeechTranscript,
  normalizeProductText,
  sanitizeAdditionalNotes
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

test("explicit Canadian 40-ounce speech normalizes to 1.14 L", () => {
  assert.equal(
    normalizeLikelySpeechTranscript(
      "I want a 40 ounce of Johnnie Walker Black Label"
    ),
    "I want a 1.14 L of Johnnie Walker Black Label"
  );
});

test("only products missing from the active catalog are selected for web verification", () => {
  const modelDraft = {
    status: "READY",
    assistantMessage: "I prepared your draft.",
    clarificationQuestion: null,
    items: [
      {
        requestedName: "Crown Royal",
        packageDescription: "750 mL",
        quantity: 1,
        confidence: "HIGH"
      },
      {
        requestedName: "Johnnie Walker Black Label",
        packageDescription: "1.14 L",
        quantity: 1,
        confidence: "HIGH"
      }
    ],
    paymentMethod: null,
    additionalNotes: null
  };

  assert.deepEqual(
    findUnmatchedRequestedNames(modelDraft, [catalogItem()]),
    ["Johnnie Walker Black Label — 1.14 L"]
  );
});

test("confirmed noisy phone transcript is normalized with product boundaries", () => {
  assert.equal(
    normalizeLikelySpeechTranscript(
      "get me a 26 year of Canadian Club 12 tall comedian and a 10 pack of Steve a pre-rolls"
    ),
    "get me a 26er of Canadian Club; 12 Molson Canadian 473 mL tall cans and a 10 pack of sativa pre-rolls"
  );
});

test("latest CC phone transcript is normalized with the same product boundaries", () => {
  assert.equal(
    normalizeLikelySpeechTranscript(
      "get me a 26 serve CC 12 tall Canadian and a 10 pack of sativa pre-rolls"
    ),
    "get me a 26er of Canadian Club; 12 Molson Canadian 473 mL tall cans and a 10 pack of sativa pre-rolls"
  );
});

test("explicit Canadian Club 12 Year wording is preserved", () => {
  assert.equal(
    normalizeLikelySpeechTranscript("Canadian Club 12 Year 750 mL"),
    "Canadian Club 12 Year 750 mL"
  );
});

test("phone's went-outside transcription is normalized as call when outside", () => {
  assert.equal(
    normalizeLikelySpeechTranscript(
      "please have the driver call went outside"
    ),
    "please have the driver call when outside"
  );

  assert.equal(
    extractExplicitDeliveryInstructions(
      "please have the driver call went outside"
    ),
    "Please have the driver call when outside."
  );
});

test("active catalog names are compacted into untrusted reference data", () => {
  const reference = buildCatalogReference([
    catalogItem({
      id: "molson",
      name: "Molson\nCanadian 473ML"
    }),
    catalogItem({
      id: "canadian-club",
      name: "Canadian club  750ml"
    })
  ]);

  assert.equal(
    reference,
    "- Molson Canadian 473ML\n- Canadian club 750ml"
  );
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

test("confirmed three-item order preserves product boundaries and quantities", () => {
  const response = buildOrderDraftResponse(
    {
      status: "READY",
      assistantMessage: "I interpreted sativa from serve.",
      clarificationQuestion: null,
      items: [
        {
          requestedName: "Canadian Club",
          packageDescription: "750 mL",
          quantity: 1,
          confidence: "MEDIUM"
        },
        {
          requestedName: "Molson Canadian",
          packageDescription: "473 mL tall can",
          quantity: 12,
          confidence: "MEDIUM"
        },
        {
          requestedName: "sativa pre-rolls",
          packageDescription: "10-pack",
          quantity: 1,
          confidence: "MEDIUM"
        }
      ],
      paymentMethod: null,
      additionalNotes: null
    },
    []
  );

  assert.equal(
    response.assistantMessage,
    "I've drafted your order. Please review each item before you place it."
  );
  assert.deepEqual(
    response.draft.items.map((item) => ({
      requestedName: item.requestedName,
      quantity: item.quantity,
      needsDispatcherReview: item.needsDispatcherReview
    })),
    [
      {
        requestedName: "Canadian Club — 750 mL",
        quantity: 1,
        needsDispatcherReview: true
      },
      {
        requestedName: "Molson Canadian — 473 mL tall can",
        quantity: 12,
        needsDispatcherReview: true
      },
      {
        requestedName: "sativa pre-rolls — 10-pack",
        quantity: 1,
        needsDispatcherReview: true
      }
    ]
  );
});

test("regular Canadian Club matches the regular catalog item instead of 12 Year", () => {
  const response = buildOrderDraftResponse(
    {
      status: "READY",
      assistantMessage: "I prepared your draft.",
      clarificationQuestion: null,
      items: [
        {
          requestedName: "Canadian Club",
          packageDescription: "750 mL",
          quantity: 1,
          confidence: "HIGH"
        }
      ],
      paymentMethod: null,
      additionalNotes: null
    },
    [
      catalogItem({
        id: "regular-cc",
        name: "Canadian club 750ml",
        normalizedName: "canadian club 750ml",
        brand: "Canadian Club",
        popularityScore: 0
      }),
      catalogItem({
        id: "aged-cc",
        name: "Canadian Club 12 Year 750 ml",
        normalizedName: "canadian club 12 year 750ml",
        brand: "Canadian Club",
        popularityScore: 0
      })
    ]
  );

  assert.equal(response.draft.items[0].catalogMatch.id, "regular-cc");
});

test("assistant guidance is removed from dispatcher notes", () => {
  assert.equal(
    sanitizeAdditionalNotes(
      "Please review the order form and press Place Order when ready."
    ),
    null
  );

  assert.equal(
    sanitizeAdditionalNotes(
      "Please have the driver call when outside. Please review the order form and press Place Order."
    ),
    "Please have the driver call when outside."
  );

  assert.equal(
    sanitizeAdditionalNotes(
      "Please review the order form and press Place Order\nPlease have the driver call when outside"
    ),
    "Please have the driver call when outside"
  );
});

test("customer-requested delivery notes are preserved in a ready draft", () => {
  const response = buildOrderDraftResponse(
    {
      status: "READY",
      assistantMessage: "Please review the order form and press Place Order.",
      clarificationQuestion: null,
      items: [
        {
          requestedName: "Bag of ice",
          packageDescription: null,
          quantity: 2,
          confidence: "HIGH"
        }
      ],
      paymentMethod: "DEBIT",
      additionalNotes:
        "Please have the driver call when outside. Please review the order form and press Place Order."
    },
    []
  );

  assert.equal(response.draft.paymentMethod, "DEBIT");
  assert.equal(
    response.draft.additionalNotes,
    "Please have the driver call when outside."
  );
});

test("explicit call-when-outside wording overrides an inaccurate model paraphrase", () => {
  const response = buildOrderDraftResponse(
    {
      status: "READY",
      assistantMessage: "I prepared your draft.",
      clarificationQuestion: null,
      items: [
        {
          requestedName: "Bag of ice",
          packageDescription: null,
          quantity: 2,
          confidence: "HIGH"
        }
      ],
      paymentMethod: "DEBIT",
      additionalNotes: "Caller will drive and went outside."
    },
    [],
    "Please have the driver call when outside."
  );

  assert.equal(
    response.draft.additionalNotes,
    "Please have the driver call when outside."
  );
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

test("duplicate model rows are consolidated into one order item", () => {
  const consolidated = consolidateModelOrderItems([
    {
      requestedName: "Bag of ice",
      packageDescription: null,
      quantity: 2,
      confidence: "HIGH"
    },
    {
      requestedName: "bag of ice",
      packageDescription: null,
      quantity: 3,
      confidence: "MEDIUM"
    }
  ]);

  assert.deepEqual(consolidated, [
    {
      requestedName: "Bag of ice",
      quantity: 5,
      confidence: "MEDIUM"
    }
  ]);
});

test("a quantity above 100 is forced to clarification without cart rows", () => {
  const response = buildOrderDraftResponse(
    {
      status: "READY",
      assistantMessage: "I prepared your draft.",
      clarificationQuestion: null,
      items: [
        {
          requestedName: "Bag of ice",
          packageDescription: null,
          quantity: 120,
          confidence: "HIGH"
        }
      ],
      paymentMethod: null,
      additionalNotes: null
    },
    []
  );

  assert.equal(response.status, "NEEDS_CLARIFICATION");
  assert.equal(response.readyForReview, false);
  assert.deepEqual(response.draft.items, []);
  assert.match(response.clarificationQuestion, /maximum quantity.*100/i);
  assert.match(response.clarificationQuestion, /120/);
});

test("duplicate rows whose combined quantity exceeds 100 are forced to clarification", () => {
  const response = buildOrderDraftResponse(
    {
      status: "READY",
      assistantMessage: "I prepared your draft.",
      clarificationQuestion: null,
      items: [
        {
          requestedName: "Bag of ice",
          packageDescription: null,
          quantity: 60,
          confidence: "HIGH"
        },
        {
          requestedName: "bag of ice",
          packageDescription: null,
          quantity: 60,
          confidence: "HIGH"
        }
      ],
      paymentMethod: null,
      additionalNotes: null
    },
    []
  );

  assert.equal(response.status, "NEEDS_CLARIFICATION");
  assert.equal(response.readyForReview, false);
  assert.deepEqual(response.draft.items, []);
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
  assert.equal(response.assistantMessage, "I need one more detail.");
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


test("260 spirit transcript asks about a 26er without guessing or changing cart", async () => {
  const { ambiguous26erQuestion, createAiOrderDraft } = require("../dist/services/aiOrderDraft.service.js");
  const catalogItems = [catalogItem({ name: "Smirnoff", brand: "Smirnoff", category: "Vodka" })];
  assert.equal(ambiguous26erQuestion("260 of Smirnoff please", catalogItems),
    "Did you mean one 26er (750 mL) of Smirnoff?");
  const response = await createAiOrderDraft({ transcript: "260 of Smirnoff please", history: [], catalogItems,
    currentCart: [{ name: "ice", quantity: 3 }] });
  assert.equal(response.readyForReview, false);
  assert.equal(response.orderSubmitted, false);
  assert.deepEqual(response.draft.items, []);
  assert.match(response.clarificationQuestion, /one 26er \(750 mL\) of Smirnoff/);
  for (const text of ["260 bottles of Smirnoff", "120 of Smirnoff", "260 bags of ice", "260 of Coke", "a 26er of Smirnoff", "yes"]) {
    assert.equal(ambiguous26erQuestion(text, catalogItems), null, text);
  }
  assert.equal(ambiguous26erQuestion("260 of Smirnoff Ice", [catalogItem({ name: "Smirnoff Ice", brand: "Smirnoff", category: "Coolers" })]), null);
});
