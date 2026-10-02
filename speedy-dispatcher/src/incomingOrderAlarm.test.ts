import assert from "node:assert/strict";
import test from "node:test";
import { createOrderAlarmState, orderAlarmReducer, type AlarmOrder } from "./incomingOrderAlarm.ts";

const order = (id: string, changes: Partial<AlarmOrder> = {}): AlarmOrder => ({
  id, orderNumber: Number(id) || 100, orderStatus: "PLACED", orderSource: "ANDROID_APP", ...changes,
});
const snapshot = (state: ReturnType<typeof createOrderAlarmState>, orders: AlarmOrder[]) =>
  orderAlarmReducer(state, { type: "snapshot", orders });
const ids = (state: ReturnType<typeof createOrderAlarmState>) => state.pending.map(item => item.id);

test("existing orders establish a quiet baseline; all new customer channels alert together", () => {
  let state = snapshot(createOrderAlarmState(), [order("old")]);
  assert.deepEqual(ids(state), []);
  state = snapshot(state, [order("old"), order("android"), order("ios", { orderSource: "IOS_APP" }),
    order("web", { orderSource: "WEBFLOW" }), order("chatgpt", { orderSource: "UNKNOWN" }),
    order("future", { orderSource: "FUTURE_CHANNEL" })]);
  assert.deepEqual(ids(state), ["android", "ios", "web", "chatgpt", "future"]);
});

test("manual source and creator attribution are both excluded; dispatch source is irrelevant", () => {
  const state = snapshot(snapshot(createOrderAlarmState(), []), [
    order("manual", { orderSource: "DISPATCHER_MANUAL" }),
    order("legacy-manual", { orderSource: "UNKNOWN", createdByUserId: "dispatcher" }),
    order("auto-dispatched", { orderStatus: "DISPATCHED" }),
    order("accepted", { orderStatus: "ACCEPTED" }),
    order("delivered", { orderStatus: "DELIVERED" }), order("cancelled", { orderStatus: "CANCELLED" }),
  ]);
  assert.deepEqual(ids(state), ["auto-dispatched", "accepted"]);
});

test("acknowledgement silences that batch while later orders still alert", () => {
  let state = snapshot(snapshot(createOrderAlarmState(), []), [order("1")]);
  state = orderAlarmReducer(state, { type: "acknowledge" });
  state = snapshot(state, [order("1")]);
  assert.deepEqual(ids(state), []);
  state = snapshot(state, [order("1"), order("2")]);
  assert.deepEqual(ids(state), ["2"]);
});

test("off clears alerts and tests; orders seen while off are not replayed", () => {
  let state = snapshot(snapshot(createOrderAlarmState(), []), [order("1")]);
  state = orderAlarmReducer(state, { type: "test" });
  state = orderAlarmReducer(state, { type: "enabled", enabled: false });
  assert.equal(state.testing, false);
  assert.deepEqual(ids(state), []);
  state = snapshot(state, [order("1"), order("2")]);
  assert.deepEqual(ids(state), []);
  state = orderAlarmReducer(state, { type: "enabled", enabled: true });
  state = snapshot(state, [order("1"), order("2"), order("3")]);
  assert.deepEqual(ids(state), ["3"]);
});

test("repeat snapshots and disappearing/reappearing IDs never generate duplicates", () => {
  let state = snapshot(snapshot(createOrderAlarmState(), []), [order("1"), order("1")]);
  assert.deepEqual(ids(state), ["1"]);
  state = snapshot(state, [order("1"), order("1")]);
  assert.deepEqual(ids(state), ["1"]);
  state = snapshot(state, []);
  state = snapshot(state, [order("1")]);
  assert.deepEqual(ids(state), []);
});

test("terminal orders clear from the alert; status changes keep one alert per order", () => {
  let state = snapshot(snapshot(createOrderAlarmState(), []), [order("1"), order("2"), order("3")]);
  state = snapshot(state, [order("1", { orderStatus: "DELIVERED" }),
    order("2", { orderStatus: "CANCELLED" }), order("3", { orderStatus: "ACCEPTED" })]);
  assert.deepEqual(ids(state), ["3"]);
});

test("logout clears session tracking without changing the saved switch preference", () => {
  let state = snapshot(createOrderAlarmState(false), [order("1")]);
  state = orderAlarmReducer(state, { type: "reset" });
  assert.equal(state.enabled, false);
  assert.equal(state.initialized, false);
  assert.equal(state.seen.size, 0);
  assert.deepEqual(ids(state), []);
});
