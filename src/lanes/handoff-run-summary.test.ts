import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHandoffPhasesSummary } from "./handoff-run-summary.js";

test("formatHandoffPhasesSummary describes skipped and finished phases", () => {
  const msg = formatHandoffPhasesSummary({
    phases: [
      { phase: "research", tick: { skipped: true, skip_reason: "research lane disabled" } },
      {
        phase: "placement",
        tick: { skipped: false, agentId: "package_architect", status: "finished" },
      },
    ],
    spawned: [],
    skipped: [],
  });
  assert.match(msg, /research: skipped/);
  assert.match(msg, /package_architect/);
});
