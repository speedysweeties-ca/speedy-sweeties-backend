import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCustomerProfileNotesPayload,
  buildManualOrderNotesPayload,
  recurringDriverNotesForCustomer,
} from "./manualOrderNotes.ts";

test("existing customer recurring driver notes load into the manual order form", () => {
  assert.equal(
    recurringDriverNotesForCustomer("$10 distance charge"),
    "$10 distance charge"
  );
});

test("a new customer starts with blank recurring driver notes", () => {
  assert.equal(recurringDriverNotesForCustomer(null), "");
  assert.equal(recurringDriverNotesForCustomer(undefined), "");
});

test("manual order notes are trimmed and remain separate in the payload", () => {
  assert.deepEqual(
    buildManualOrderNotesPayload(
      " Leave at the front door ",
      " $10 distance charge "
    ),
    {
      additionalNotes: "Leave at the front door",
      recurringDriverNotes: "$10 distance charge",
    }
  );
});

test("a deliberate recurring-note clear is submitted as an empty string", () => {
  assert.deepEqual(buildManualOrderNotesPayload("Order note", "   "), {
    additionalNotes: "Order note",
    recurringDriverNotes: "",
  });
});

test("customer profile edits save both current note fields", () => {
  assert.deepEqual(
    buildCustomerProfileNotesPayload(
      " Use the side entrance ",
      " Do not assign to Driver A "
    ),
    {
      recurringDriverNotes: "Use the side entrance",
      dispatcherNotes: "Do not assign to Driver A",
    }
  );
});

test("customer profile edits can deliberately clear either saved note", () => {
  assert.deepEqual(buildCustomerProfileNotesPayload("   ", ""), {
    recurringDriverNotes: "",
    dispatcherNotes: "",
  });
});
