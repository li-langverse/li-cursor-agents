import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { loadSwarmBriefingSnapshot } from "./swarm-briefing-snapshot.js";

test("loadSwarmBriefingSnapshot reads fixture briefing", () => {
  const snap = loadSwarmBriefingSnapshot({
    swarm_scorecard: { pending_handoffs: 1 },
    handoff_audit: { open_handoffs: 1 },
  });
  assert.ok(snap?.swarm_scorecard);
});

test("loadSwarmBriefingSnapshot from agents data/latest when present", () => {
  process.env.BENCHMARKS_ROOT = join(agentsPackageRoot(), "fixtures", "e2e-benchmarks");
  const snap = loadSwarmBriefingSnapshot(null);
  assert.ok(snap?.swarm_scorecard || snap?.research_goals_status);
});
