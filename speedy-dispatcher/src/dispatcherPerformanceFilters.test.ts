import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDispatcherPerformanceRequestBody,
  toggleDispatcherPerformanceFilter,
} from "./dispatcherPerformanceFilters.ts";

test("builds combined dispatcher and order-source performance filters", () => {
  const body = buildDispatcherPerformanceRequestBody({
    startDate: "2026-09-01",
    endDate: "2026-09-12",
    dispatcherIds: ["shannon-id"],
    sourceGroups: ["ONLINE"],
  });

  assert.deepEqual(body, {
    startDate: "2026-09-01",
    endDate: "2026-09-12",
    dispatcherIds: ["shannon-id"],
    sourceGroups: ["ONLINE"],
  });
});

test("omits unrestricted performance filter dimensions", () => {
  const body = buildDispatcherPerformanceRequestBody({
    startDate: "2026-09-01",
    endDate: "2026-09-12",
    dispatcherIds: [],
    sourceGroups: [],
  });

  assert.deepEqual(body, {
    startDate: "2026-09-01",
    endDate: "2026-09-12",
  });
});

test("toggles filter values on and off", () => {
  assert.deepEqual(toggleDispatcherPerformanceFilter([], "dispatcher-1"), [
    "dispatcher-1",
  ]);
  assert.deepEqual(
    toggleDispatcherPerformanceFilter(["dispatcher-1"], "dispatcher-1"),
    []
  );
});

test("dispatcher and source click handlers immediately reload performance", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("./App.tsx", import.meta.url), "utf8")
  );
  const dispatcherHandler = source.slice(
    source.indexOf("const toggleDispatcherPerformanceId"),
    source.indexOf("const selectAllDispatcherPerformanceIds")
  );
  const sourceHandler = source.slice(
    source.indexOf("const toggleDispatcherPerformanceSourceGroup"),
    source.indexOf("const clearDispatcherPerformanceSourceGroups")
  );

  assert.match(dispatcherHandler, /fetchDispatcherPerformance/);
  assert.match(sourceHandler, /fetchDispatcherPerformance/);
  assert.match(source, /method: "POST"/);
});
