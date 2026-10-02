import assert from "node:assert/strict";
import test from "node:test";
import { bndAlertReducer, createBndAlertState, getBndAlertView, parseBndStatus, type BndStatus } from "./bndOrderAlerts.ts";

const now = Date.parse("2026-10-02T20:00:00Z");
const snapshot = (ids = ["1"]): BndStatus => ({
  state: "connected", pendingOrders: ids.map(id => ({ id, number: `46800${id}` })),
  lastCheckedAt: new Date(now).toISOString(), lastSuccessAt: new Date(now).toISOString(),
  nextCheckAt: new Date(now + 60000).toISOString(), errorCode: null,
});
const receive = (s = snapshot()) => bndAlertReducer(createBndAlertState(), { type: "snapshot", token: "staff", snapshot: s });

test("initial waiting calls alert immediately and repeated snapshots do not acknowledge them", () => {
  let state = receive();
  for (let i = 0; i < 10; i++) {
    state = bndAlertReducer(state, { type: "snapshot", token: "staff", snapshot: snapshot() });
    assert.equal(getBndAlertView(state, "staff", now).alerting, true);
  }
  state = bndAlertReducer(state, { type: "snapshot", token: "staff", snapshot: snapshot([]) });
  assert.equal(getBndAlertView(state, "staff", now).alerting, false);
});

test("claims remove only resolved calls while other calls keep alerting", () => {
  let state = receive(snapshot(["1", "2"]));
  state = bndAlertReducer(state, { type: "snapshot", token: "staff", snapshot: snapshot(["2"]) });
  const view = getBndAlertView(state, "staff", now);
  assert.equal(view.alerting, true); assert.deepEqual(view.pending.map(o => o.id), ["2"]);
});

test("failed checks retain alarms and display unavailable even with an empty last-known list", () => {
  for (const ids of [["1"], []]) {
    const state = bndAlertReducer(receive(snapshot(ids)), { type: "failed", token: "staff" });
    const view = getBndAlertView(state, "staff", now);
    assert.equal(view.unavailable, true); assert.equal(view.alerting, ids.length > 0);
    assert.equal(getBndAlertView(receive(snapshot(ids)), "staff", now + 120001).unavailable, true);
  }
  const upstreamError = { ...snapshot(), state: "error" as const, errorCode: "connection" as const };
  assert.equal(getBndAlertView(receive(upstreamError), "staff", now).alerting, true);
  assert.equal(getBndAlertView(receive(upstreamError), "staff", now).unavailable, true);
});

test("toggle mutes this browser but turning it back on resumes unresolved alerts", () => {
  let state = bndAlertReducer(receive(), { type: "enabled", enabled: false });
  assert.equal(getBndAlertView(state, "staff", now).alerting, false);
  state = bndAlertReducer(state, { type: "enabled", enabled: true });
  assert.equal(getBndAlertView(state, "staff", now).alerting, true);
});

test("logout and changed sessions never expose the previous session's alerts", () => {
  const state = receive();
  assert.equal(getBndAlertView(state, null, now).alerting, false);
  assert.equal(getBndAlertView(state, "different", now).pending.length, 0);
  assert.equal(bndAlertReducer(state, { type: "failed", token: "different" }).snapshot, null);
});

test("disabled monitoring and unconfigured login do not claim to have waiting calls", () => {
  for (const state of ["disabled", "unconfigured"] as const) {
    const view = getBndAlertView(receive({ ...snapshot(), state }), "staff", now);
    assert.equal(view.alerting, false); assert.equal(view.pending.length, 0);
  }
});

test("invalid status replies are rejected so the fetch path retains its previous snapshot", () => {
  assert.deepEqual(parseBndStatus(snapshot()), snapshot());
  for (const bad of [null, {}, [], { ...snapshot(), pendingOrders: null },
    { ...snapshot(), pendingOrders: [{ id: "1" }] }, { ...snapshot(), state: "unknown" },
    { ...snapshot(), lastSuccessAt: null }, { ...snapshot(), nextCheckAt: "bad" }]) {
    assert.throws(() => parseBndStatus(bad));
  }
});
