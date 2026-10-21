import assert from "node:assert/strict";
import test from "node:test";
import { createOrderAlarmState, isUnacceptedOrderLate, orderAlarmReducer, type AlarmOrder } from "./incomingOrderAlarm.ts";

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
  assert.deepEqual(state.waitingForAcceptance, []);
});

const createdAt = "2026-10-21T14:00:00.000Z";
const fiveMinutesLater = Date.parse(createdAt) + 5 * 60_000;
const overdueIds = (state: ReturnType<typeof createOrderAlarmState>, now = fiveMinutesLater) =>
  state.enabled ? state.waitingForAcceptance.filter(item => isUnacceptedOrderLate(item, now)).map(item => item.id) : [];

test("acceptance warning starts at five minutes for both placed and dispatched calls", () => {
  for (const orderStatus of ["PLACED", "DISPATCHED"]) {
    const waiting = order("1", { createdAt, orderStatus });
    assert.equal(isUnacceptedOrderLate(waiting, fiveMinutesLater - 1), false);
    assert.equal(isUnacceptedOrderLate(waiting, fiveMinutesLater), true);
    assert.equal(isUnacceptedOrderLate(waiting, fiveMinutesLater + 60_000), true);
  }
});

test("accepted, completed, cancelled, review, and undated calls never trigger acceptance warning", () => {
  for (const orderStatus of ["ACCEPTED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "NEEDS_REVIEW"]) {
    assert.equal(isUnacceptedOrderLate(order("1", { createdAt, orderStatus }), fiveMinutesLater), false);
  }
  assert.equal(isUnacceptedOrderLate(order("1", { createdAt, acceptedAt: createdAt }), fiveMinutesLater), false);
  for (const invalidDate of [undefined, null, "", "not-a-date", "2026-10-22T14:00:00.000Z"]) {
    assert.equal(isUnacceptedOrderLate(order("1", { createdAt: invalidDate }), fiveMinutesLater), false);
  }
});

test("existing overdue calls alert at login, including manual orders, without duplicate alerts", () => {
  const manual = order("manual", { createdAt, orderSource: "DISPATCHER_MANUAL", createdByUserId: "dispatcher" });
  const state = snapshot(createOrderAlarmState(), [manual, manual, order("app", { createdAt, orderStatus: "DISPATCHED" })]);
  assert.deepEqual(ids(state), []);
  assert.deepEqual(overdueIds(state), ["manual", "app"]);
});

test("a call can become overdue without another snapshot or a new-order acknowledgement suppressing it", () => {
  let state = snapshot(snapshot(createOrderAlarmState(), []), [order("1", { createdAt })]);
  assert.deepEqual(overdueIds(state, fiveMinutesLater - 1), []);
  state = orderAlarmReducer(state, { type: "acknowledge" });
  assert.deepEqual(ids(state), []);
  assert.deepEqual(overdueIds(state), ["1"]);
});

test("fresh acceptance, cancellation, and removal clear overdue alerts while other waiting calls remain", () => {
  let state = snapshot(createOrderAlarmState(), ["1", "2", "3", "4"].map(id => order(id, { createdAt })));
  state = snapshot(state, [order("1", { createdAt, orderStatus: "ACCEPTED" }),
    order("2", { createdAt, orderStatus: "CANCELLED" }), order("4", { createdAt, orderStatus: "DISPATCHED" })]);
  assert.deepEqual(overdueIds(state), ["4"]);
  state = snapshot(state, []);
  assert.deepEqual(overdueIds(state), []);
});

test("alarm switch suppresses overdue alerts; turning it on rechecks still-waiting calls", () => {
  let state = snapshot(createOrderAlarmState(), [order("1", { createdAt })]);
  state = orderAlarmReducer(state, { type: "enabled", enabled: false });
  assert.deepEqual(overdueIds(state), []);
  state = snapshot(state, [order("1", { createdAt }), order("2", { createdAt })]);
  state = orderAlarmReducer(state, { type: "enabled", enabled: true });
  assert.deepEqual(overdueIds(state), ["1", "2"]);
});
