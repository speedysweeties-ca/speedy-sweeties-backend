import assert from "node:assert/strict";
import test from "node:test";

// The runtime marker patch is exercised by the production TypeScript build.
// This smoke test protects the source contract that driver markers remain labelled.
test("driver marker fix source keeps initial labels enabled", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("./driverMarkerPinFix.ts", import.meta.url), "utf8"),
  );

  assert.match(source, /getDriverInitial/);
  assert.match(source, /setLabel/);
  assert.match(source, /labelOrigin/);
  assert.doesNotMatch(source, /SymbolPath\.CIRCLE,\s*scale:\s*9/);
});
