const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const source = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const fixture = fs.readFileSync(path.join(__dirname, "fixtures/order-form.html"), "utf8");
const KEY = "speedy.order-tracking.v1";
const TOKEN = "A".repeat(43);
const OTHER = "B".repeat(43);
const record = (token = TOKEN, orderNumber = 123) => ({ token, orderNumber, savedAt: Date.now() - 1000 });
const result = (status = "PLACED", number = 123) => ({ success: true, data: { orderId: "example", orderNumber: number, orderStatus: status } });
const response = (data, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => data, headers: { get: key => headers[key] || null } });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

async function setup(t, { saved = [], hash = "", fetcher, storageBlocked = false } = {}) {
  const dom = new JSDOM(fixture, { url: "https://www.speedysweeties.ca/" + hash, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  t.after(() => w.close());
  await new Promise(resolve => w.document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  w.HTMLElement.prototype.scrollIntoView = function () {};
  const scheduled = new Map();
  let sequence = 0;
  w.setTimeout = (fn, ms) => { const id = ++sequence; scheduled.set(id, { fn, ms }); return id; };
  w.clearTimeout = id => scheduled.delete(id);
  w.AbortController = AbortController;
  const requests = [];
  w.fetch = async (url, options) => {
    requests.push({ url, options });
    return fetcher ? fetcher(url, options, requests.length) : response(result());
  };
  if (saved !== null) w.localStorage.setItem(KEY, typeof saved === "string" ? saved : JSON.stringify(saved));
  if (storageBlocked) Object.defineProperty(w, "localStorage", { get() { throw new Error("Storage blocked"); } });
  w.eval(source("order-tracking-head.js"));
  const analyticsLocation = w.location.href;
  w.eval(source("order-form.js"));
  w.eval(source("order-tracking.js"));
  // The real published scripts run before DOMContentLoaded.
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  await flush();
  const panel = w.document.getElementById("track-my-order");
  const get = role => panel.querySelector(`[data-role="${role}"]`);
  const button = action => panel.querySelector(`[data-action="${action}"]`);
  const tick = async ms => {
    const item = [...scheduled].find(([, timer]) => timer.ms === ms);
    assert.ok(item, "Expected timer at " + ms + "ms");
    scheduled.delete(item[0]); item[1].fn(); await flush();
  };
  const created = (token = TOKEN, status = "PLACED", number = 123) => w.document.dispatchEvent(new w.CustomEvent("speedy:order-created", { detail: { trackingToken: token, order: { orderNumber: number, orderStatus: status } } }));
  return { w, panel, get, button, scheduled, requests, tick, created, analyticsLocation };
}

test("new visitors see the original order form with no empty tracker or API calls", async t => {
  const s = await setup(t);
  assert.equal(s.panel.hidden, true);
  assert.equal(s.requests.length, 0);
  assert.equal(s.w.document.getElementById("email-form").style.display, "");
});

test("successful submission preserves quantities, payment and access fields and remembers only tracking metadata", async t => {
  const s = await setup(t, { fetcher: (url, opts) => opts.method === "POST"
    ? response({ success: true, trackingToken: TOKEN, order: { orderNumber: 123, orderStatus: "PLACED" } }, 201)
    : response(result()) });
  const values = { "Name-5": "Test Customer", Phone: "5195550101", Email: "test@example.com", "Confirm-Email": "test@example.com", Address: "10 Test Street", "Apartment-Unit-Number": " 4B ", "Buzz-Code": " 456 ", City: "Guelph", Items: "2 x Cola, 3 Bags of ice", "Additional-Notes": "Test note" };
  for (const [id, value] of Object.entries(values)) s.w.document.getElementById(id).value = value;
  s.w.document.getElementById("Payment-Method---Debit").checked = true;
  for (const el of s.w.document.querySelectorAll('input[type="checkbox"][required]')) el.checked = true;
  const form = s.w.document.getElementById("email-form");
  assert.equal(form.checkValidity(), true);
  form.dispatchEvent(new s.w.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const posts = s.requests.filter(r => r.options.method === "POST");
  assert.equal(posts.length, 1);
  const payload = JSON.parse(posts[0].options.body);
  assert.equal(payload.unitNumber, "4B"); assert.equal(payload.buzzCode, "456");
  assert.equal(payload.addressLine1, "10 Test Street"); assert.equal(payload.paymentMethod, "DEBIT");
  assert.deepEqual(payload.items.map(i => [i.name, i.quantity]), [["Cola", 2], ["Bags of ice", 3]]);
  assert.equal(form.style.display, "none");
  assert.match(s.w.document.querySelector(".w-form-done").textContent, /order #123/);
  assert.equal(s.panel.hidden, false);
  const saved = JSON.parse(s.w.localStorage.getItem(KEY));
  assert.deepEqual(Object.keys(saved[0]).sort(), ["orderNumber", "savedAt", "token"]);
  assert.equal(saved[0].token, TOKEN);
  assert.doesNotMatch(JSON.stringify(saved), /Customer|Street|519555|456/);
  const reopened = await setup(t, { saved });
  assert.equal(reopened.panel.hidden, false);
  assert.match(reopened.get("status").textContent, /Order received/);
  assert.equal(reopened.requests[0].options.cache, "no-store");
});

test("all four stages update by polling; delivery stops polling", async t => {
  let status = "PLACED";
  const s = await setup(t, { saved: [record()], fetcher: () => response(result(status)) });
  for (const [next, label] of [["ACCEPTED", "Driver assigned"], ["OUT_FOR_DELIVERY", "On the way"], ["DELIVERED", "Delivered"]]) {
    status = next; await s.tick(15000);
    assert.match(s.get("status").textContent, new RegExp(label));
  }
  assert.equal(s.scheduled.size, 0);
  assert.equal(s.panel.querySelectorAll('[data-state="complete"]').length, 4);
  assert.equal(s.button("refresh").hidden, true);
});

test("cancelled orders do not show delivery progress or keep polling", async t => {
  const s = await setup(t, { saved: [record()], fetcher: () => response(result("CANCELLED")) });
  assert.match(s.get("status").textContent, /Order cancelled/);
  assert.equal(s.panel.querySelector("ol").hidden, true);
  assert.equal(s.scheduled.size, 0);
});

test("private links work in a fresh browser and are removed from the URL before analytics", async t => {
  const s = await setup(t, { hash: "#track=" + TOKEN, saved: [] });
  assert.equal(s.analyticsLocation, "https://www.speedysweeties.ca/#track-my-order");
  assert.equal(s.w.speedyTrackingLink, undefined);
  assert.equal(s.requests.length, 1);
  assert.match(s.requests[0].url, /track-token\/A{43}$/);
  assert.equal(s.requests[0].options.referrerPolicy, "no-referrer");
  assert.equal(JSON.parse(s.w.localStorage.getItem(KEY))[0].token, TOKEN);
});

test("private link copy offers a selectable fallback when clipboard access is unavailable", async t => {
  const s = await setup(t, { saved: [record()] });
  s.button("copy").click(); await flush();
  assert.equal(s.get("link-fallback").hidden, false);
  assert.equal(s.panel.querySelector("#ss-track-link").value, "https://www.speedysweeties.ca/#track=" + TOKEN);
});

test("blocked browser storage does not prevent tracking or claiming the successful order", async t => {
  const s = await setup(t, { storageBlocked: true });
  s.created(); await flush();
  assert.match(s.get("status").textContent, /Order received/);
  assert.match(s.get("notice").textContent, /cannot remember/);
  assert.equal(s.requests.length, 1);
});

test("invalid or expired storage is ignored, and malformed links do not call the API", async t => {
  for (const saved of ["not-json", {}, [record("bad")], [{ ...record(), savedAt: Date.now() - 49 * 60 * 60 * 1000 }]]) {
    const s = await setup(t, { saved });
    assert.equal(s.requests.length, 0); assert.equal(s.panel.hidden, true);
  }
  const s = await setup(t, { hash: "#track=%3Cscript%3E" });
  assert.equal(s.requests.length, 0); assert.equal(s.panel.hidden, false);
  assert.match(s.get("error").textContent, /invalid/);
});

test("expired API token clears saved access without guessing order status or using legacy IDs", async t => {
  const s = await setup(t, { saved: [record()], fetcher: () => response({}, 404) });
  assert.match(s.get("status").textContent, /unavailable/);
  assert.match(s.get("error").textContent, /not been cancelled/);
  assert.deepEqual(JSON.parse(s.w.localStorage.getItem(KEY)), []);
  assert.equal(s.scheduled.size, 0); assert.equal(s.requests.length, 1);
});

test("network failure retains the last confirmed stage and retries automatically", async t => {
  let fails = false;
  const s = await setup(t, { saved: [record()], fetcher: () => fails ? Promise.reject(new Error("offline")) : response(result("ACCEPTED")) });
  fails = true; await s.tick(15000);
  assert.match(s.get("status").textContent, /Driver assigned/);
  assert.match(s.get("error").textContent, /last confirmed/);
  fails = false; await s.tick(30000);
  assert.equal(s.get("error").hidden, true);
});

test("rate limiting honors Retry-After, and unknown statuses are never shown as delivered", async t => {
  const s = await setup(t, { saved: [record()], fetcher: () => response({}, 429, { "Retry-After": "120" }) });
  assert.ok([...s.scheduled.values()].some(timer => timer.ms === 120000));
  const unknown = await setup(t, { saved: [record()], fetcher: () => response(result("UNRECOGNIZED")) });
  assert.equal(unknown.panel.querySelector("ol").hidden, true);
  assert.match(unknown.get("error").textContent, /cannot refresh/);
});

test("hidden tabs stop polling and refresh when visible again", async t => {
  const s = await setup(t, { saved: [record()] });
  let hidden = true;
  Object.defineProperty(s.w.document, "hidden", { get: () => hidden });
  s.w.document.dispatchEvent(new s.w.Event("visibilitychange"));
  assert.equal(s.scheduled.size, 0);
  hidden = false; s.w.document.dispatchEvent(new s.w.Event("visibilitychange")); await flush();
  assert.equal(s.requests.length, 2);
});

test("late responses for an old order cannot overwrite a newly selected order", async t => {
  let resolveFirst;
  const s = await setup(t, { saved: [record()], fetcher: url => url.endsWith(TOKEN)
    ? new Promise(resolve => { resolveFirst = resolve; })
    : response(result("OUT_FOR_DELIVERY", 456)) });
  s.created(OTHER, "PLACED", 456); await flush();
  resolveFirst(response(result("DELIVERED", 123))); await flush();
  assert.equal(s.get("order").textContent, "Order #456");
  assert.match(s.get("status").textContent, /On the way/);
  assert.equal(s.get("selector").hidden, false);
});

test("missing tracking credentials leave the successful order intact and never show a different order", async t => {
  const s = await setup(t, { saved: [record()] });
  s.created(undefined, "PLACED", 456); // Explicitly dispatch a response without a credential.
  s.w.document.dispatchEvent(new s.w.CustomEvent("speedy:order-created", { detail: { order: { orderNumber: 456 } } }));
  await flush();
  assert.equal(s.get("order").textContent, "");
  assert.match(s.get("error").textContent, /Do not submit the order again/);
  assert.equal(s.panel.querySelector("ol").hidden, true);
});

test("API text is not interpreted as HTML and forget only removes browser tracking", async t => {
  const s = await setup(t, { saved: [record()], fetcher: () => response(result("ACCEPTED", '<img src=x onerror="bad()">')) });
  assert.equal(s.panel.querySelector("img"), null);
  s.button("forget").click(); await flush();
  assert.equal(s.panel.hidden, true);
  assert.equal(s.requests.length, 1);
  assert.deepEqual(JSON.parse(s.w.localStorage.getItem(KEY)), []);
});
