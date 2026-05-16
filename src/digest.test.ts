import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDigest } from "./digest.js";
import type { CycleRecord } from "./history.js";

test("generateDigest produces markdown with results table", () => {
  const cycle: CycleRecord = {
    cycleId: "cycle-test-1234",
    startedAt: "2026-05-16T22:00:00Z",
    completedAt: "2026-05-16T22:05:00Z",
    agentsRun: ["orchestrator", "ecosystem_explorer"],
    results: [
      {
        agentId: "orchestrator",
        backend: "mock",
        status: "finished",
        durationMs: 1200,
        timestamp: "2026-05-16T22:01:00Z",
        outputPath: "/tmp/test.md",
        findings: ["gap1: missing io", "gap2: missing net"],
      },
      {
        agentId: "ecosystem_explorer",
        backend: "mock",
        status: "error",
        durationMs: 500,
        timestamp: "2026-05-16T22:03:00Z",
        outputPath: "/tmp/test2.md",
        findings: [],
      },
    ],
    nextPriorities: ["ecosystem_explorer", "numerics_research"],
  };

  const digest = generateDigest({ root: "/tmp", cycle });

  assert.ok(digest.includes("# Overnight Cycle Digest"));
  assert.ok(digest.includes("cycle-test-1234"));
  assert.ok(digest.includes("orchestrator"));
  assert.ok(digest.includes("ecosystem_explorer"));
  assert.ok(digest.includes("✅ finished"));
  assert.ok(digest.includes("❌ error"));
  assert.ok(digest.includes("Key Findings"));
  assert.ok(digest.includes("gap1: missing io"));
  assert.ok(digest.includes("Next Cycle Priorities"));
  assert.ok(digest.includes("Self-Improvement Notes"));
});

test("generateDigest handles empty cycle", () => {
  const cycle: CycleRecord = {
    cycleId: "cycle-empty",
    startedAt: "2026-05-16T22:00:00Z",
    agentsRun: [],
    results: [],
  };

  const digest = generateDigest({ root: "/tmp", cycle });
  assert.ok(digest.includes("# Overnight Cycle Digest"));
  assert.ok(digest.includes("cycle-empty"));
});
