import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { saveLaneState } from "./lane-state.js";
import { runHandoffPhasedSwarm } from "./run-handoff-phases.js";

test("runHandoffPhasedSwarm force runs when lane toggles are off", async () => {
  const dir = join(agentsPackageRoot(), "data", "handoffs");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pending.jsonl"), "", "utf8");

  saveLaneState({
    research_lane_enabled: false,
    implement_lane_enabled: false,
    goal_last_run_at: {},
  });

  const result = await runHandoffPhasedSwarm({ mock: true });
  assert.ok(result.phases.length >= 1);
  const reasons = result.phases.map((p) => p.tick.skip_reason).filter(Boolean);
  assert.ok(
    !reasons.includes("research lane disabled"),
    `expected force bypass, got: ${reasons.join(", ")}`,
  );
});
