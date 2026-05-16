import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import {
  loadHistory,
  saveHistory,
  createCycle,
  recordRun,
  pruneHistory,
  getRecentCycles,
} from "./history.js";

const TEST_ROOT = join(process.cwd(), "data", "test-history");

function setup() {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
  mkdirSync(TEST_ROOT, { recursive: true });
  mkdirSync(join(TEST_ROOT, "data"), { recursive: true });
}

function teardown() {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
}

test("loadHistory returns empty on missing file", () => {
  setup();
  const h = loadHistory(join(TEST_ROOT, "nonexistent"));
  assert.equal(h.version, 1);
  assert.equal(h.cycles.length, 0);
  teardown();
});

test("createCycle + saveHistory + loadHistory round-trip", () => {
  setup();
  const h = loadHistory(TEST_ROOT);
  const cycle = createCycle(h);
  assert.ok(cycle.cycleId.startsWith("cycle-"));
  assert.equal(h.cycles.length, 1);
  saveHistory(TEST_ROOT, h);
  const h2 = loadHistory(TEST_ROOT);
  assert.equal(h2.cycles.length, 1);
  assert.equal(h2.cycles[0].cycleId, cycle.cycleId);
  teardown();
});

test("recordRun adds entry to cycle", () => {
  setup();
  const h = loadHistory(TEST_ROOT);
  const cycle = createCycle(h);
  recordRun(cycle, {
    agentId: "orchestrator",
    backend: "mock",
    status: "finished",
    durationMs: 42,
    outputPath: "/tmp/test.md",
    outputText: "- **gap1**: missing thing\n- **gap2**: another thing",
  });
  assert.equal(cycle.results.length, 1);
  assert.equal(cycle.results[0].agentId, "orchestrator");
  assert.equal(cycle.results[0].findings?.length, 2);
  assert.ok(cycle.agentsRun.includes("orchestrator"));
  teardown();
});

test("pruneHistory keeps max 50 cycles", () => {
  const h = { version: 1 as const, lastUpdated: "", cycles: [] as any[] };
  for (let i = 0; i < 60; i++) {
    h.cycles.push({ cycleId: `cycle-${i}`, startedAt: "", agentsRun: [], results: [] });
  }
  pruneHistory(h);
  assert.equal(h.cycles.length, 50);
  assert.equal(h.cycles[0].cycleId, "cycle-10");
});

test("getRecentCycles returns last N", () => {
  const h = { version: 1 as const, lastUpdated: "", cycles: [] as any[] };
  for (let i = 0; i < 10; i++) {
    h.cycles.push({ cycleId: `cycle-${i}`, startedAt: "", agentsRun: [], results: [] });
  }
  const recent = getRecentCycles(h, 3);
  assert.equal(recent.length, 3);
  assert.equal(recent[0].cycleId, "cycle-7");
});
