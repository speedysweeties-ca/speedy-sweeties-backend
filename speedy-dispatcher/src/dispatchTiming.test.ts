import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchWaitingMilliseconds, isDispatchTimerPaused } from './dispatchTiming.ts';
import { isUnacceptedOrderLate } from './incomingOrderAlarm.ts';
const at = (m: number) => new Date(Date.UTC(2026, 9, 21, 12, m)).toISOString();
const order = {
  id: 'one', orderNumber: 1, orderStatus: 'PLACED', createdAt: at(0),
  dispatchEditPauses: [{ startedAt: at(3), expiresAt: at(8), endedAt: at(7) }]
};
test('live wait, warning, and five-minute boundary deduct verified editing', () => {
  assert.equal(dispatchWaitingMilliseconds(order, Date.parse(at(8))), 4 * 60_000);
  assert.equal(isUnacceptedOrderLate(order, Date.parse(at(8))), false);
  assert.equal(isUnacceptedOrderLate(order, Date.parse(at(9))), true);
});
test('an open editor freezes until its lease expires', () => {
  const active = { ...order, dispatchEditPauses: [{ startedAt: at(3), expiresAt: at(8), endedAt: null }] };
  assert.equal(isDispatchTimerPaused(active, Date.parse(at(6))), true);
  assert.equal(dispatchWaitingMilliseconds(active, Date.parse(at(6))), 3 * 60_000);
  assert.equal(isDispatchTimerPaused(active, Date.parse(at(9))), false);
  assert.equal(dispatchWaitingMilliseconds(active, Date.parse(at(9))), 4 * 60_000);
});
test('concurrent editors do not double-credit and dispatch ends the editing allowance', () => {
  const edited = { ...order, firstDispatchedAt: at(6), dispatchEditPauses: [
    ...order.dispatchEditPauses, { startedAt: at(4), expiresAt: at(10), endedAt: null }
  ] };
  assert.equal(isDispatchTimerPaused(edited, Date.parse(at(8))), false);
  assert.equal(dispatchWaitingMilliseconds(edited, Date.parse(at(8))), 5 * 60_000);
});
