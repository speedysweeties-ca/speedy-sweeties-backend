const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isWebflowOrderOrigin,
  resolveOrderSourceAttribution
} = require("../dist/utils/orderSourceAttribution.js");

test("recognizes only the approved Speedy Sweeties Webflow origins", () => {
  for (const origin of [
    "https://speedysweeties.ca",
    "https://www.speedysweeties.ca",
    "https://speedy-sweeties.webflow.io"
  ]) {
    assert.equal(isWebflowOrderOrigin(origin), true, origin);
  }

  for (const origin of [
    undefined,
    "",
    "not-a-url",
    "http://www.speedysweeties.ca",
    "https://speedysweeties.ca.evil.example",
    "https://www.speedysweeties.ca/order"
  ]) {
    assert.equal(isWebflowOrderOrigin(origin), false, String(origin));
  }
});

test("infers WEBFLOW when the website submits no source or UNKNOWN", () => {
  for (const requestedSource of [undefined, "UNKNOWN"]) {
    assert.equal(
      resolveOrderSourceAttribution({
        requestedSource,
        requestOrigin: "https://www.speedysweeties.ca"
      }),
      "WEBFLOW"
    );
  }
});

test("preserves explicit customer-app sources", () => {
  assert.equal(
    resolveOrderSourceAttribution({
      requestedSource: "IOS_APP",
      requestOrigin: "https://www.speedysweeties.ca"
    }),
    "IOS_APP"
  );
  assert.equal(
    resolveOrderSourceAttribution({
      requestedSource: "ANDROID_APP",
      requestOrigin: undefined
    }),
    "ANDROID_APP"
  );
});

test("uses the protected manual-order override ahead of public attribution", () => {
  assert.equal(
    resolveOrderSourceAttribution({
      requestedSource: "WEBFLOW",
      requestOrigin: "https://www.speedysweeties.ca",
      override: "DISPATCHER_MANUAL"
    }),
    "DISPATCHER_MANUAL"
  );
});

test("leaves missing or untrusted origins UNKNOWN", () => {
  for (const requestOrigin of [
    undefined,
    "https://example.com",
    "https://speedysweeties.ca.evil.example"
  ]) {
    assert.equal(
      resolveOrderSourceAttribution({
        requestedSource: undefined,
        requestOrigin
      }),
      "UNKNOWN"
    );
  }
});
