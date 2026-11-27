import test from 'node:test';
import assert from 'node:assert/strict';
import { ReleaseController, RELEASE_LOGIN_KEY } from './releaseController.ts';
const current = 'a'.repeat(64), next = 'b'.repeat(64);
function fixture() {
  let served: unknown = current, now = 0, reads = 0;
  const values = new Map<string, string>(), navigations: string[] = [];
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const controller = new ReleaseController({ current, storage, now: () => now,
    read: async () => { reads++; if (served instanceof Error) throw served; return served; },
    navigate: value => { navigations.push(value); } });
  return { controller, values, navigations, storage, serve: (value: unknown) => { served = value; },
    advance: () => { now += 30000; }, reads: () => reads };
}

test('unchanged and absent API hints add no requests or sign-outs', async () => {
  const f = fixture();
  for (const hint of [current, null, '', 'invalid']) f.controller.observe(hint);
  assert.equal(f.reads(), 0); assert.equal(f.controller.canReload(), false);
  await f.controller.check(); assert.equal(f.reads(), 1); assert.equal(f.controller.pending, null);
});

test('API deployment cannot reload until the dispatcher itself serves the update', async () => {
  const f = fixture(); f.controller.observe(next); await f.controller.check();
  assert.equal(f.controller.pending, null);
  f.serve(next); f.controller.observe(next); assert.equal(f.reads(), 1);
  f.advance(); f.controller.observe(next); await f.controller.check();
  assert.equal(f.controller.pending, next); assert.equal(f.controller.canReload(), true);
});

test('login checks bypass the hint throttle and malformed/offline manifests do not sign out', async () => {
  const f = fixture();
  for (const value of [null, {}, '<html>', new Error('offline')]) {
    f.serve(value); await f.controller.check(); assert.equal(f.controller.pending, null);
  }
  f.serve(next); await f.controller.check(); assert.equal(f.controller.pending, next);
  assert.equal(f.navigations.length, 0);
});

test('multiple hidden drafts independently block until all are saved or cancelled', async () => {
  const f = fixture(); f.serve(next); await f.controller.check();
  const manual = Symbol(), pinboard = Symbol();
  f.controller.block(manual, true); f.controller.block(pinboard, true);
  assert.equal(f.controller.canReload(), false);
  f.controller.block(manual, false); assert.equal(f.controller.canReload(), false);
  f.controller.block(pinboard, false); assert.equal(f.controller.canReload(), true);
});

test('overlapping writes block refresh until both bodies finish', async () => {
  const f = fixture(); f.serve(next); await f.controller.check();
  f.controller.startWrite(); f.controller.startWrite(); assert.equal(f.controller.canReload(), false);
  f.controller.endWrite(false); assert.equal(f.controller.canReload(), false);
  f.controller.endWrite(false); assert.equal(f.controller.canReload(), true);
});

test('uncertain saves stay protected even if a screen unmounts or another save succeeds', async () => {
  const f = fixture(); f.serve(next); await f.controller.check();
  const form = Symbol(); f.controller.block(form, true); f.controller.startWrite();
  f.controller.block(form, false); f.controller.endWrite(true);
  f.controller.startWrite(); f.controller.endWrite(false);
  assert.equal(f.controller.canReload(), false);
});

test('Keep working defers automatic refresh while the login path can still load the update', async () => {
  const f = fixture(); f.serve(next); await f.controller.check();
  f.controller.defer(); assert.equal(f.controller.canReload(), false);
  assert.equal(f.controller.reload(), true); assert.deepEqual(f.navigations, [next]);
  assert.equal(f.values.get(RELEASE_LOGIN_KEY), '1');
});

test('stale-cache loop attempts are bounded and storage failure never navigates', async () => {
  const f = fixture(); f.serve(next); await f.controller.check();
  f.controller.reload(); assert.equal(f.controller.reload(), false);
  assert.equal(f.controller.loopStopped, true); assert.equal(f.navigations.length, 1);
  const broken = new ReleaseController({ current, read: async () => next,
    storage: { ...f.storage, setItem() { throw new Error('storage denied'); } },
    navigate() { assert.fail('must not navigate without a per-tab gate'); } });
  await broken.check(); assert.equal(broken.reload(), false);
});

test('rollback cancels the pending release after confirming the served manifest', async () => {
  const f = fixture(); f.serve(next); await f.controller.check();
  f.serve(current); f.advance(); f.controller.observe(current); await f.controller.check();
  assert.equal(f.controller.pending, null); assert.equal(f.controller.canReload(), false);
});

test('only the updating tab receives a sign-in gate; another tab keeps its draft', async () => {
  const first = fixture(), second = fixture();
  first.serve(next); second.serve(next);
  await first.controller.check(); await second.controller.check();
  second.controller.block(Symbol('draft'), true);
  first.controller.reload();
  assert.equal(second.values.get(RELEASE_LOGIN_KEY), undefined);
  assert.equal(second.controller.canReload(), false); assert.equal(second.navigations.length, 0);
});
