const test = require("node:test");
const assert = require("node:assert/strict");
const { DispatchSource, UserRole } = require("@prisma/client");
const {
  getFirstDispatchAttribution
} = require("../dist/utils/dispatchAttribution");

test("records the signed-in staff user on the first manual dispatch", () => {
  assert.deepEqual(
    getFirstDispatchAttribution(null, {
      userId: "dispatcher-1",
      role: UserRole.DISPATCHER
    }),
    {
      dispatchSource: DispatchSource.MANUAL,
      dispatchedByUserId: "dispatcher-1"
    }
  );
});

test("labels a driver-originated first transition without claiming a staff user", () => {
  assert.deepEqual(
    getFirstDispatchAttribution(null, {
      userId: "driver-1",
      role: UserRole.DRIVER
    }),
    {
      dispatchSource: DispatchSource.DRIVER,
      dispatchedByUserId: null
    }
  );
});

test("preserves the original attribution after dispatch", () => {
  assert.deepEqual(
    getFirstDispatchAttribution(new Date("2026-09-05T12:00:00.000Z"), {
      userId: "dispatcher-2",
      role: UserRole.DISPATCHER
    }),
    {}
  );
});
