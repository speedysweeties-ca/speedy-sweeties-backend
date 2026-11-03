import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the component effect with fake Maps/backend adapters. No Google requests
// or browser credentials are used; refs are attached by the JSX renderer below.
const source = readFileSync(new URL('../src/RoutingPreviewEnhancerOriginalPins.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function mountMap({ delayedSdk = false } = {}) {
  let effect;
  let mapCount = 0;
  let drivers = [{ id: 'driver', firstName: 'Test', isOnline: true, latitude: 43.5, longitude: -80.2, activeOrderCount: 1 }];
  let orders = [{ id: 'order', orderNumber: 1, orderStatus: 'PLACED', geocodeStatus: 'VERIFIED', deliveryLatitude: 43.6, deliveryLongitude: -80.3 }];
  const markers = [];
  const intervals = new Map();
  const events = new Map();
  const requests = [];
  let intervalId = 0;
  const maps = {
    Map: class { constructor() { mapCount++; } addListener() {} fitBounds() {} },
    Marker: class {
      constructor(options) { Object.assign(this, options); this.listeners = {}; markers.push(this); }
      setMap(value) { this.map = value; }
      setPosition(value) { this.position = value; }
      setTitle(value) { this.title = value; }
      setIcon() {}
      setLabel() {}
      addListener(name, callback) { this.listeners[name] = callback; }
    },
    LatLngBounds: class { extend() {} },
    event: { addListenerOnce() {} },
  };
  const window = {
    google: delayedSdk ? undefined : { maps },
    setInterval(callback, delay) { const id = ++intervalId; intervals.set(id, { callback, delay }); return id; },
    clearInterval(id) { intervals.delete(id); },
    addEventListener(name, callback) { events.set(name, callback); },
    removeEventListener(name) { events.delete(name); },
  };
  const jsx = (_type, props) => { if (props?.ref) props.ref.current = {}; return props; };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, window,
    localStorage: { getItem: () => 'synthetic-test-token' },
    fetch: async (url) => {
      requests.push(url);
      return { ok: true, json: async () => url.endsWith('/orders') ? { orders } : { drivers } };
    },
    require(name) {
      if (name === 'react') return {
        useRef: (current) => ({ current }), useState: (value) => [value, () => {}],
        useEffect: (callback) => { effect = callback; },
      };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === './apiConfig') return { API_V1_BASE_URL: 'https://backend.test/api/v1' };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  exports.RoutingPreviewMap();
  const cleanup = effect();
  return {
    cleanup, markers, intervals, events, requests,
    get mapCount() { return mapCount; },
    enableSdk() { window.google = { maps }; },
    setData(nextDrivers, nextOrders) { drivers = nextDrivers; orders = nextOrders; },
    async tick(delay) {
      for (const entry of [...intervals.values()]) if (entry.delay === delay) entry.callback();
      await new Promise(setImmediate);
    },
  };
}

test('one map survives repeated GPS refreshes, updates pins and cleans up on leaving the tab', async () => {
  const view = mountMap();
  await new Promise(setImmediate);
  assert.equal(view.mapCount, 1);
  assert.equal(view.markers.length, 2);
  assert.deepEqual(Object.keys(view.markers[1].listeners), ['mouseover', 'mouseout', 'click']);
  for (let i = 0; i < 20; i++) await view.tick(3000);
  assert.equal(view.mapCount, 1);
  assert.equal(view.markers.length, 2);
  assert.equal(view.requests.length, 42);
  view.setData([{ id: 'driver', firstName: 'Test', isOnline: true, latitude: 44, longitude: -81, activeOrderCount: 0 }], []);
  await view.tick(3000);
  assert.equal(view.markers[0].position.lat, 44);
  assert.equal(view.markers[1].map, null);
  view.cleanup();
  assert.equal(view.markers[0].map, null);
  assert.equal(view.intervals.size, 0);
  assert.equal(view.events.size, 0);
  const reopened = mountMap();
  await new Promise(setImmediate);
  assert.equal(reopened.mapCount, 1);
  reopened.cleanup();
});

test('waits for Maps SDK and ignores responses arriving after unmount', async () => {
  const view = mountMap({ delayedSdk: true });
  assert.equal(view.mapCount, 0);
  view.enableSdk();
  await view.tick(250);
  assert.equal(view.mapCount, 1);
  assert.equal([...view.intervals.values()].filter(({ delay }) => delay === 250).length, 0);
  view.cleanup();
  const closedBeforeResponse = mountMap();
  closedBeforeResponse.cleanup();
  await new Promise(setImmediate);
  assert.equal(closedBeforeResponse.mapCount, 0);
  assert.equal(closedBeforeResponse.intervals.size, 0);
});
