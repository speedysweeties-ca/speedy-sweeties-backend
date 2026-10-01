import assert from "node:assert/strict";
import test from "node:test";
import { helpRequestBody, isHelpAnswer, helpAnswerText, type HelpTurn } from "./dispatcherHelpClient.ts";

test("follow-ups send only the bounded recent conversation", () => {
  const turns: HelpTurn[] = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: String(i) }));
  const body = helpRequestBody(" address? ", turns);
  assert.equal(body.question, "address?");
  assert.equal(body.history.length, 8);
  assert.equal(body.history[0].content, "4");
  assert.equal(helpRequestBody("x", [{ role: "assistant", content: "x".repeat(9000) }]).history[0].content.length, 6000);
});

test("source navigation only accepts recognized dispatcher destinations", () => {
  const value = { status: "ANSWERED", answer: "Open Customers", steps: ["Edit then Save"], notes: [], sources: [{ id: "profile", title: "Profile", reviewedAt: "2026-09-30", content: "Steps", destination: "CUSTOMERS" }] };
  assert.equal(isHelpAnswer(value), true);
  assert.equal(isHelpAnswer({ ...value, sources: [{ ...value.sources[0], destination: "https://evil.example" }] }), false);
  assert.equal(isHelpAnswer({ ...value, sources: [null] }), false);
  assert.equal(isHelpAnswer({ ...value, steps: [12] }), false);
  assert.equal(isHelpAnswer(null), false);
  if (isHelpAnswer(value)) assert.equal(helpAnswerText(value), "Open Customers\n1. Edit then Save");
});
