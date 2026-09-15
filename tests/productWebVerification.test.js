const assert = require("node:assert/strict");
const test = require("node:test");

process.env.OPENAI_API_KEY = "test-only-key";

const {
  extractWebSearchSourceUrls,
  isPlausibleRequestedProductMatch,
  requestWebProductVerification,
  validateWebVerificationResult
} = require("../dist/services/productWebVerification.service.js");

const foundResult = (overrides = {}) => ({
  status: "FOUND",
  canonicalName: "Johnnie Walker Black Label Scotch Whisky",
  brand: "Johnnie Walker",
  size: "1.14 L",
  category: "SPIRITS",
  retailer: "LCBO",
  productUrl:
    "https://www.lcbo.com/en/johnnie-walker-black-label-scotch-whisky-7880?source=search",
  confidence: "HIGH",
  ...overrides
});

test("only URLs returned as web-search evidence are extracted", () => {
  const payload = {
    output: [
      {
        type: "web_search_call",
        action: {
          type: "search",
          sources: [
            {
              type: "url",
              url: "https://www.lcbo.com/en/johnnie-walker-black-label-scotch-whisky-7880"
            }
          ]
        }
      },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: '{"productUrl":"https://untrusted.example/product"}'
          }
        ]
      }
    ]
  };

  assert.deepEqual(extractWebSearchSourceUrls(payload), [
    "https://www.lcbo.com/en/johnnie-walker-black-label-scotch-whisky-7880"
  ]);
});

test("the OpenAI request can search only the approved retailer domains", async () => {
  const originalFetch = global.fetch;
  let requestBody;
  const productUrl =
    "https://www.lcbo.com/en/johnnie-walker-black-label-scotch-whisky-7880";

  global.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        output_text: JSON.stringify(foundResult({ productUrl })),
        output: [
          {
            type: "web_search_call",
            action: {
              type: "search",
              sources: [{ type: "url", url: productUrl }]
            }
          }
        ]
      })
    };
  };

  try {
    const result = await requestWebProductVerification(
      "Johnnie Walker Black Label 1.14 L"
    );

    assert.ok(result);
    assert.deepEqual(requestBody.tools[0].filters.allowed_domains, [
      "lcbo.com",
      "thebeerstore.ca",
      "savagecloud.ca"
    ]);
    assert.equal(requestBody.tool_choice, "required");
    assert.deepEqual(requestBody.include, ["web_search_call.action.sources"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("an exact approved retailer result becomes auditable catalog data", () => {
  const verifiedAt = new Date("2026-09-15T14:30:00.000Z");
  const result = validateWebVerificationResult(
    foundResult(),
    [
      "https://www.lcbo.com/en/johnnie-walker-black-label-scotch-whisky-7880"
    ],
    "Johnny Walker Black Label 1.14 L",
    verifiedAt
  );

  assert.deepEqual(result, {
    name: "Johnnie Walker Black Label Scotch Whisky 1.14 L",
    normalizedName: "johnnie walker black label scotch whisky 1.14 l",
    brand: "Johnnie Walker",
    normalizedBrand: "johnnie walker",
    size: "1.14 L",
    category: "Spirits",
    source: "LCBO",
    pickupType: "LCBO",
    webVerificationUrl:
      "https://lcbo.com/en/johnnie-walker-black-label-scotch-whisky-7880",
    webVerifiedAt: verifiedAt
  });
});

test("a claimed product URL without matching search evidence is rejected", () => {
  assert.equal(
    validateWebVerificationResult(
      foundResult(),
      ["https://www.lcbo.com/en"],
      "Johnnie Walker Black Label 1.14 L"
    ),
    null
  );
});

test("retailer home, search, and collection pages cannot verify a product", () => {
  assert.equal(
    validateWebVerificationResult(
      foundResult({ productUrl: "https://www.lcbo.com/en" }),
      ["https://www.lcbo.com/en"],
      "Johnnie Walker Black Label 1.14 L"
    ),
    null
  );
  assert.equal(
    validateWebVerificationResult(
      foundResult({
        canonicalName: "STLTH Green Apple Ice",
        brand: "STLTH",
        size: "20 mg/mL",
        category: "VAPE",
        retailer: "SAVAGE_CLOUD",
        productUrl: "https://savagecloud.ca/collections/vape"
      }),
      ["https://savagecloud.ca/collections/vape"],
      "STLTH Green Apple Ice 20 mg/mL"
    ),
    null
  );
});

test("a retailer label that conflicts with the source domain is rejected", () => {
  assert.equal(
    validateWebVerificationResult(
      foundResult({ retailer: "THE_BEER_STORE" }),
      [
        "https://www.lcbo.com/en/johnnie-walker-black-label-scotch-whisky-7880"
      ],
      "Johnnie Walker Black Label 1.14 L"
    ),
    null
  );
});

test("ambiguous and lower-confidence results are never accepted", () => {
  const sourceUrls = [
    "https://www.lcbo.com/en/johnnie-walker-black-label-scotch-whisky-7880"
  ];

  assert.equal(
    validateWebVerificationResult(
      foundResult({ status: "AMBIGUOUS", canonicalName: null }),
      sourceUrls,
      "Johnnie Walker Black Label 1.14 L"
    ),
    null
  );
  assert.equal(
    validateWebVerificationResult(
      foundResult({ confidence: "MEDIUM" }),
      sourceUrls,
      "Johnnie Walker Black Label 1.14 L"
    ),
    null
  );
});

test("Savage Cloud products map to the VAPE pickup type", () => {
  const result = validateWebVerificationResult(
    foundResult({
      canonicalName: "STLTH Green Apple Ice",
      brand: "STLTH",
      size: "20 mg/mL",
      category: "VAPE",
      retailer: "SAVAGE_CLOUD",
      productUrl: "https://savagecloud.ca/products/stlth-green-apple-ice"
    }),
    ["https://savagecloud.ca/products/stlth-green-apple-ice"],
    "STLTH Green Apple Ice 20 mg/mL"
  );

  assert.equal(result.source, "SAVAGE_CLOUD");
  assert.equal(result.pickupType, "VAPE");
});

test("the verified page must match the requested product and size", () => {
  assert.equal(
    isPlausibleRequestedProductMatch(
      "Johnny Walker Black Label 1.14 L",
      "Johnnie Walker Black Label Scotch Whisky",
      "1.14 L"
    ),
    true
  );
  assert.equal(
    isPlausibleRequestedProductMatch(
      "Johnnie Walker Black Label 1.14 L",
      "Johnnie Walker Black Label Scotch Whisky",
      "1.75 L"
    ),
    false
  );
  assert.equal(
    isPlausibleRequestedProductMatch(
      "Johnnie Walker Black Label 1.14 L",
      "Johnnie Walker Red Label Scotch Whisky",
      "1.14 L"
    ),
    false
  );
});
