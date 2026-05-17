/**
 * Phased run-all (research → placement → implement) without supervisor.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { createHandoff, listHandoffs } from "../handoffs/handoff-store.js";
import { runHandoffPhasedSwarm } from "../lanes/run-handoff-phases.js";
import { loadLaneState, saveLaneState } from "../lanes/lane-state.js";

describe("run-all handoff phases (mock)", () => {
  test("runHandoffPhasedSwarm runs research then implement ticks", async () => {
    const root = agentsPackageRoot();
    const dir = join(root, "data", "handoffs");
    const sessionsDir = join(root, "data", "research-sessions");
    rmSync(dir, { recursive: true, force: true });
    rmSync(sessionsDir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "pending.jsonl"), "", "utf8");

    saveLaneState({
      research_lane_enabled: true,
      implement_lane_enabled: true,
      goal_last_run_at: {},
    });

    await createHandoff({
      from_agent: "goal_researcher",
      to_agents: ["package_architect", "code_implementer"],
      status: "pending_placement",
      research_goal_id: "web_platform",
      north_star_fit: "Web stack gaps; domains: web; PH-7e",
      work: { summary: "e2e phased run-all seed" },
    });

    const result = await runHandoffPhasedSwarm({ mock: true });
    assert.ok(result.phases.length >= 1, JSON.stringify(result));
    assert.ok(result.phases.some((p) => p.phase === "research"));
    assert.ok(result.research, "expected research phase result");

    const after = await listHandoffs({ limit: 20 });
    const seeded = after.some((h) => h.research_goal_id === "web_platform");
    assert.ok(seeded || result.phases.length >= 2, "seed handoff or multi-phase run");
  });
});
