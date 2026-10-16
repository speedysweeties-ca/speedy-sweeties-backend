const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");

const script = fs.readFileSync(path.join(__dirname, "../public/webflow/address-autocomplete.js"), "utf8");

function browser(fetchResponse = async () => ({ success: true, verified: true })) {
  const elements = new Map(), requests = [], timers = new Map();
  let nextTimer = 0;
  class Element {
    constructor(id = "") {
      this.id = id; this.value = ""; this.style = {}; this.attributes = {};
      this.children = []; this.listeners = {}; this.options = [{ value: "Guelph" }];
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    removeAttribute(name) { delete this.attributes[name]; }
    append(...children) { this.children.push(...children); children.forEach(child => elements.set(child.id, child)); }
    prepend(child) { this.children.unshift(child); elements.set(child.id, child); }
    after(...children) { children.forEach(child => elements.set(child.id, child)); }
    replaceChildren() { this.children = []; }
    querySelector() { return null; }
    addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
    fire(name) { for (const handler of this.listeners[name] || []) handler({}); }
    focus() { this.focused = true; }
  }
  for (const id of ["email-form", "Name-5", "Address", "City", "Apartment-Unit-Number", "Buzz-Code", "Email", "Confirm-Email", "Phone"]) {
    elements.set(id, new Element(id));
  }
  elements.get("City").value = "Guelph";
  const context = vm.createContext({
    document: { readyState: "complete", getElementById: id => elements.get(id), createElement: () => new Element() },
    window: { getComputedStyle: () => ({ color: "rgb(230, 230, 230)" }) }, crypto: { randomUUID }, AbortController,
    setTimeout: (callback, delay) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      requests.push({ url, body });
      const data = await fetchResponse(url, body);
      return { ok: data.success !== false, json: async () => data };
    }
  });
  vm.runInContext(script, context);
  return { elements, requests, timers, context, api: context.window.speedyAddress,
    get: id => elements.get(id), rerun: () => vm.runInContext(script, context) };
}

test("first-visit form supports saved contact details without reading or sending them on load", () => {
  const b = browser();
  assert.equal(b.get("email-form").autocomplete, "on");
  for (const [id, token] of Object.entries({
    "Name-5": "name", Address: "address-line1", City: "address-level2",
    "Apartment-Unit-Number": "address-line2", Email: "email", Phone: "tel",
    "Confirm-Email": "off", "Buzz-Code": "off"
  })) assert.equal(b.get(id).getAttribute("autocomplete"), token);
  assert.match(b.get("speedy-autofill-help").textContent, /saved details/);
  assert.equal(b.get("speedy-autofill-help").style.color, "rgb(230, 230, 230)");
  assert.match(b.get("Name-5").getAttribute("aria-describedby"), /speedy-autofill-help/);
  assert.equal(b.requests.length, 0);
  b.rerun();
  assert.equal(b.get("email-form").children.length, 1);
});

test("autofilled address without input events is checked on submission and keeps unit/buzz separate", async () => {
  const b = browser();
  b.get("Address").value = " 10 Example Street ";
  b.get("Apartment-Unit-Number").value = "4B";
  b.get("Buzz-Code").value = "1234";
  const address = { addressLine1: "10 Example Street", city: "Guelph" };
  assert.equal(b.api.matches(address), false);
  assert.equal(await b.api.verify(), true);
  assert.deepEqual(b.requests, [{ url: "https://speedy-api-lbfe.onrender.com/api/v1/addresses/verify",
    body: { ...address, province: "Ontario" } }]);
  assert.equal(b.api.matches(address), true);
  assert.equal(b.get("Apartment-Unit-Number").value, "4B");
  assert.equal(b.get("Buzz-Code").value, "1234");
  b.get("Address").value = "12 Example Street";
  assert.equal(b.api.matches(address), false);
});

test("invalid addresses and provider failures cannot become approved saved addresses", async () => {
  for (const data of [
    { success: false, message: "Address not found" },
    { success: false, message: "Address checking is temporarily unavailable" },
    { success: true, verified: false },
    { success: true, verified: "true" }
  ]) {
    const b = browser(async () => data);
    b.get("Address").value = "10 Example Street";
    await assert.rejects(b.api.verify());
    assert.equal(b.api.matches({ addressLine1: "10 Example Street", city: "Guelph" }), false);
    assert.equal(b.get("Address").value, "10 Example Street");
    assert.equal(b.get("Address").getAttribute("aria-invalid"), "true");
  }
});

test("blank addresses do not make a verification request", async () => {
  const b = browser();
  await assert.rejects(b.api.verify(), /full street address/);
  assert.equal(b.requests.length, 0);
});

test("an address changed during verification is rejected, even without browser events", async () => {
  let finish;
  const b = browser(() => new Promise(resolve => { finish = resolve; }));
  b.get("Address").value = "10 Example Street";
  const pending = b.api.verify();
  b.get("Address").value = "12 Example Street";
  finish({ success: true, verified: true });
  await assert.rejects(pending, /address changed/);
  assert.equal(b.api.matches({ addressLine1: "12 Example Street", city: "Guelph" }), false);
});

test("edits invalidate an in-flight check even if the address returns to its original value", async () => {
  let finish;
  const b = browser(() => new Promise(resolve => { finish = resolve; }));
  b.get("Address").value = "10 Example Street";
  const pending = b.api.verify();
  b.get("Address").fire("input");
  finish({ success: true, verified: true });
  await assert.rejects(pending, /address changed/);
  assert.equal(b.api.matches({ addressLine1: "10 Example Street", city: "Guelph" }), false);
});

test("submitting an autofilled address cancels pending suggestions and city changes invalidate it", async () => {
  const b = browser();
  b.get("Address").value = "10 Example Street";
  b.get("Address").fire("input");
  assert.equal([...b.timers.values()].some(timer => timer.delay === 300), true);
  await b.api.verify();
  assert.equal(b.timers.size, 0);
  assert.equal(b.requests.length, 1);
  b.get("City").fire("change");
  assert.equal(b.api.matches({ addressLine1: "10 Example Street", city: "Guelph" }), false);
});
