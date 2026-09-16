const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webflowScriptPath = path.join(
  __dirname,
  "..",
  "webflow",
  "order-form.js"
);
const webflowScript = fs.readFileSync(webflowScriptPath, "utf8");
const {
  buildAddressAccessFields,
  normalizeOptionalAddressField
} = require(webflowScriptPath);

test("Webflow order-form custom code has valid JavaScript syntax", () => {
  assert.doesNotThrow(() => new vm.Script(webflowScript));
});

test("Webflow optional access fields trim values and preserve blanks as null", () => {
  assert.equal(normalizeOptionalAddressField("  4B  "), "4B");
  assert.equal(normalizeOptionalAddressField("  "), null);
  assert.equal(normalizeOptionalAddressField(undefined), null);

  const values = {
    "Unit-Number": { value: " 12A " },
    "Buzz-Code": { value: " 2468 " }
  };
  const documentRef = {
    getElementById: (id) => values[id] || null
  };

  assert.deepEqual(buildAddressAccessFields(documentRef), {
    unitNumber: "12A",
    buzzCode: "2468"
  });
});

test("Webflow order payload keeps access details separate from street address", () => {
  assert.match(webflowScript, /addressLine1:\s*document\.getElementById\("Address"\)/);
  assert.match(webflowScript, /\.\.\.buildAddressAccessFields\(document\)/);
  assert.match(webflowScript, /Apartment \/ Unit Number \(Optional\)/);
  assert.match(webflowScript, /Buzz Code \(Optional\)/);
  assert.match(webflowScript, /input\.maxLength = 50/);
  assert.doesNotMatch(
    webflowScript,
    /addressLine1:[^\n]+(?:Unit-Number|Buzz-Code)/
  );
});
