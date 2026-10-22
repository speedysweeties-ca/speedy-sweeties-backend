const assert = require("node:assert/strict");
const test = require("node:test");
const { getBndSchedule } = require("../dist/integrations/bnd/schedule.js");

test("independent Render builds use identical monitoring hours and timezone rules", () => {
  const { readFileSync } = require("node:fs");
  const { resolve } = require("node:path");
  assert.equal(
    readFileSync(resolve(__dirname, "../src/integrations/bnd/schedule.ts"), "utf8"),
    readFileSync(resolve(__dirname, "../speedy-dispatcher/src/bndSchedule.ts"), "utf8"),
  );
});

test("published opening and closing boundaries include Sunday and shorter weekdays", () => {
  for (const [at, open, next] of [
    ["2026-10-17T13:29:59.999Z", false, "2026-10-17T13:30:00Z"],
    ["2026-10-17T13:30:00Z", true, "2026-10-18T01:00:00Z"],
    ["2026-10-18T00:59:59.999Z", true, "2026-10-18T01:00:00Z"],
    ["2026-10-18T01:00:00Z", false, "2026-10-18T15:30:00Z"],
    ["2026-10-18T15:30:00Z", true, "2026-10-18T21:00:00Z"],
    ["2026-10-18T21:00:00Z", false, "2026-10-19T13:30:00Z"],
    ["2026-10-20T00:00:00Z", false, "2026-10-20T13:30:00Z"],
    ["2026-01-17T14:29:59.999Z", false, "2026-01-17T14:30:00Z"],
    ["2026-01-17T14:30:00Z", true, "2026-01-18T02:00:00Z"],
    ["2026-01-18T02:00:00Z", false, "2026-01-18T16:30:00Z"],
    ["2026-12-31T02:00:00Z", false, "2026-12-31T14:30:00Z"],
    ["2027-01-01T02:00:00Z", false, "2027-01-01T14:30:00Z"],
  ]) {
    assert.deepEqual(getBndSchedule(Date.parse(at)), { open, nextChangeAt: Date.parse(next) }, at);
  }
});
test("overnight timers handle both daylight-saving transitions", () => {
  for (const [at, next, hours] of [
    ["2026-03-08T02:00:00Z", "2026-03-08T15:30:00Z", 13.5],
    ["2026-11-01T01:00:00Z", "2026-11-01T16:30:00Z", 15.5],
  ]) {
    const schedule = getBndSchedule(Date.parse(at));
    assert.equal(schedule.open, false);
    assert.equal(schedule.nextChangeAt, Date.parse(next));
    assert.equal(schedule.nextChangeAt - Date.parse(at), hours * 60 * 60_000);
  }
});
