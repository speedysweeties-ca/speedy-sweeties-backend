const assert = require("node:assert/strict");
const test = require("node:test");
const { prisma } = require("../dist/lib/prisma.js");
const {
  getGoogleLiveTrafficEnabled,
  saveGoogleLiveTrafficEnabled
} = require("../dist/services/googleLiveTrafficSettings.service.js");

const replaceForTest = (t, target, property, replacement) => {
  const original = target[property];
  target[property] = replacement;
  t.after(() => {
    target[property] = original;
  });
};

test("Google Live Traffic defaults on and persists an off selection", async (t) => {
  let storedValue;

  replaceForTest(t, prisma.systemSetting, "findUnique", async ({ where }) => {
    assert.equal(where.key, "googleLiveTrafficEnabled");
    return storedValue === undefined ? null : { value: storedValue };
  });
  replaceForTest(t, prisma.systemSetting, "upsert", async ({ where, update, create }) => {
    assert.equal(where.key, "googleLiveTrafficEnabled");
    storedValue = storedValue === undefined ? create.value : update.value;
    return { key: where.key, value: storedValue };
  });

  assert.equal(await getGoogleLiveTrafficEnabled(), true);
  assert.equal(await saveGoogleLiveTrafficEnabled(false), false);
  assert.equal(storedValue, "false");
  assert.equal(await getGoogleLiveTrafficEnabled(), false);
});
