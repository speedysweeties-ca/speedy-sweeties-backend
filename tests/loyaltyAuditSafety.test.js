const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("app-only loyalty audit remains read-only", () => {
  const source = fs.readFileSync(
    "src/jobs/auditAppOnlyLoyalty.job.ts",
    "utf8"
  );

  assert.equal(source.includes("prisma.order.findMany"), true);

  for (const writeOperation of [
    ".create(",
    ".createMany(",
    ".update(",
    ".updateMany(",
    ".delete(",
    ".deleteMany(",
    ".$executeRaw",
    ".$queryRaw"
  ]) {
    assert.equal(source.includes(writeOperation), false, writeOperation);
  }
});
