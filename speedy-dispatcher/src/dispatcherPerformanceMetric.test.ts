import assert from "node:assert/strict";
import test from "node:test";

test("order-source table displays the longest dispatch time", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("./DispatcherPerformance.tsx", import.meta.url), "utf8")
  );
  const sourceTable = source.slice(
    source.indexOf("Dispatch Time by Order Source"),
    source.indexOf("Data Coverage")
  );

  assert.match(sourceTable, />Longest Dispatch</);
  assert.match(sourceTable, /source\.longestDispatchMinutes/);
  assert.doesNotMatch(sourceTable, /90th Percentile|source\.p90DispatchMinutes/);
});
