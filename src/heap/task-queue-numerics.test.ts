import { test } from "node:test";
import assert from "node:assert/strict";
import { limitNumericsTasksPerTick } from "./task-queue.js";
import type { HeapTask } from "./plan.js";
import type { ControlPlaneState } from "../control-plane/types.js";

const numericsTasks: HeapTask[] = [
  {
    coordinator: "coord_numerics",
    agent: "numerics_researcher",
    reason: "red benchmark rows",
    priority: 20,
  },
  {
    coordinator: "coord_numerics",
    agent: "bench_improver",
    reason: "fix red rows in lic harness",
    priority: 20,
  },
  {
    coordinator: "coord_numerics",
    agent: "autoresearch",
    reason: "pure_li",
    priority: 20,
  },
  {
    coordinator: "coord_governance",
    agent: "plan_verifier",
    reason: "audit",
    priority: 30,
  },
];

test("limitNumericsTasksPerTick keeps one numerics agent by default", () => {
  const prev = process.env.LI_HEAP_MAX_NUMERICS_PER_TICK;
  process.env.LI_HEAP_MAX_NUMERICS_PER_TICK = "1";
  const state: ControlPlaneState = {
    version: 1,
    updated_at: new Date().toISOString(),
    recent_tasks: [],
    runs_total: 0,
    last_briefing_hash: "",
    last_preflight_at: new Date().toISOString(),
    last_tick_at: new Date().toISOString(),
    stopped_agents: [],
    supervisor_status: "idle",
  };
  const out = limitNumericsTasksPerTick(numericsTasks, state);
  const numerics = out.filter((t) => t.coordinator === "coord_numerics");
  assert.equal(numerics.length, 1);
  assert.equal(numerics[0]?.agent, "numerics_researcher");
  assert.equal(out.filter((t) => t.coordinator === "coord_governance").length, 1);
  process.env.LI_HEAP_MAX_NUMERICS_PER_TICK = prev;
});

test("limitNumericsTasksPerTick prefers bench_improver after researcher finished", () => {
  const prev = process.env.LI_HEAP_MAX_NUMERICS_PER_TICK;
  process.env.LI_HEAP_MAX_NUMERICS_PER_TICK = "1";
  const state: ControlPlaneState = {
    version: 1,
    updated_at: new Date().toISOString(),
    recent_tasks: [
      {
        fingerprint: "fp",
        agentId: "numerics_researcher",
        reason: "red",
        finished_at: new Date().toISOString(),
        status: "finished",
        briefing_hash: "abc",
      },
    ],
    runs_total: 1,
    last_briefing_hash: "",
    last_preflight_at: new Date().toISOString(),
    last_tick_at: new Date().toISOString(),
    stopped_agents: [],
    supervisor_status: "idle",
  };
  const out = limitNumericsTasksPerTick(numericsTasks, state);
  const numerics = out.filter((t) => t.coordinator === "coord_numerics");
  assert.equal(numerics.length, 1);
  assert.equal(numerics[0]?.agent, "bench_improver");
  process.env.LI_HEAP_MAX_NUMERICS_PER_TICK = prev;
});
