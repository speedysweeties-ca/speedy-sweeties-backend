import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptChargeAmount, receiptEvidenceDate, receiptExtraStops } from "./receiptEvidence.ts";

test("retained structured charges keep a redacted receipt readable without restoring private notes", () => {
  const receipt = {
    notes: null,
    retainedChargeEvidence: {
      extraStops: 2,
      extraStopCharge: "8.00",
      distanceSurcharge: "4.00"
    },
    createdAt: "2026-03-02T18:00:00.000Z"
  };
  assert.equal(receiptExtraStops(receipt), 2);
  assert.equal(receiptChargeAmount(receipt, "extraStopCharge", "Extra stop charge"), 8);
  assert.equal(receiptChargeAmount(receipt, "distanceSurcharge", "Distance surcharge"), 4);
  assert.equal(receiptEvidenceDate({
    deliveredAt: null,
    createdAt: "2026-03-01T12:00:00.000Z",
    updatedAt: "2026-10-23T12:00:00.000Z",
    digitalReceipt: receipt
  }), receipt.createdAt);
  assert.equal(JSON.stringify(receipt).includes("Gate code"), false);
});

test("legacy unredacted receipts still read recognized facts from their notes", () => {
  const receipt = { notes: "Extra stops: 1\nExtra stop charge: $3.25\nDistance surcharge: $2" };
  assert.equal(receiptExtraStops(receipt), 1);
  assert.equal(receiptChargeAmount(receipt, "extraStopCharge", "Extra stop charge"), 3.25);
  assert.equal(receiptChargeAmount(receipt, "distanceSurcharge", "Distance surcharge"), 2);
});
