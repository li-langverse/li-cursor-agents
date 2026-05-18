import assert from "node:assert/strict";
import test from "node:test";
import { defaultStatsRunLimit, parseStatsTimeRange } from "./stats-time-range.js";

test("parseStatsTimeRange presets", () => {
  const p = new URLSearchParams("range=7d");
  const r = parseStatsTimeRange(p);
  assert.equal(r.preset, "7d");
  assert.ok(r.since);
  assert.equal(r.label, "last 7 days");
});

test("parseStatsTimeRange custom", () => {
  const p = new URLSearchParams(
    "range=custom&since=2026-01-01T00:00:00.000Z&until=2026-02-01T00:00:00.000Z",
  );
  const r = parseStatsTimeRange(p);
  assert.equal(r.preset, "custom");
  assert.ok(r.since);
  assert.ok(r.until);
});

test("defaultStatsRunLimit caps scan size", () => {
  assert.equal(defaultStatsRunLimit("1d"), 400);
  assert.equal(defaultStatsRunLimit("7d"), 1_500);
  assert.equal(defaultStatsRunLimit("all"), 10_000);
});
