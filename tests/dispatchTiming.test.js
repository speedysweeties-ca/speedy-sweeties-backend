const assert = require('node:assert/strict');
const test = require('node:test');
const { editPauseMilliseconds, dispatchWaitingMilliseconds } = require('../dist/services/dispatchTiming.js');
const at = minutes => new Date(Date.UTC(2026, 9, 21, 12, minutes));
const pause = (start, end, expired = end) => ({ startedAt: at(start), endedAt: end == null ? null : at(end), expiresAt: at(expired) });

test('editing pauses the wait without resetting time already spent', () => {
  assert.equal(dispatchWaitingMilliseconds(at(0), at(8), [pause(3, 7)]), 4 * 60_000);
  assert.equal(dispatchWaitingMilliseconds(at(0), at(9), [pause(3, 7)]), 5 * 60_000);
});
test('overlapping editors count once and pauses clip to first dispatch', () => {
  assert.equal(editPauseMilliseconds([pause(2, 6), pause(4, 9), pause(11, 12)], at(0), at(8)), 6 * 60_000);
  assert.equal(editPauseMilliseconds([pause(-2, 3)], at(0), at(8)), 3 * 60_000);
});
test('lost browser sessions expire and old orders retain their original duration', () => {
  assert.equal(dispatchWaitingMilliseconds(at(0), at(10), [pause(2, null, 4)]), 8 * 60_000);
  assert.equal(dispatchWaitingMilliseconds(at(0), at(10)), 10 * 60_000);
  assert.equal(editPauseMilliseconds([pause(8, 9)], at(0), at(5)), 0);
});
