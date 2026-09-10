const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildCustomerLookupWhere
} = require("../dist/utils/customerIdentity.js");

test("shared placeholder emails cannot merge customers with different phones", () => {
  const sharedEmail = "example@yahoo.com";

  const lisaLookup = buildCustomerLookupWhere({
    normalizedPhone: "5195554841",
    normalizedEmail: sharedEmail
  });
  const kevinLookup = buildCustomerLookupWhere({
    normalizedPhone: "5195554749",
    normalizedEmail: sharedEmail
  });

  assert.deepEqual(lisaLookup, { normalizedPhone: "5195554841" });
  assert.deepEqual(kevinLookup, { normalizedPhone: "5195554749" });
  assert.notDeepEqual(lisaLookup, kevinLookup);
  assert.equal("normalizedEmail" in lisaLookup, false);
  assert.equal("normalizedEmail" in kevinLookup, false);
});

test("real shared emails also cannot override phone identity", () => {
  const firstLookup = buildCustomerLookupWhere({
    normalizedPhone: "5195550100",
    normalizedEmail: "household@example.com"
  });
  const secondLookup = buildCustomerLookupWhere({
    normalizedPhone: "5195550101",
    normalizedEmail: "household@example.com"
  });

  assert.notDeepEqual(firstLookup, secondLookup);
});
