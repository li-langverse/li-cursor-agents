import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRunInput } from "../agent-run-trace.js";
import { loadResearchGoals, pickNextGoalForAgent } from "./load-goals.js";
import {
  buildResearchGoalKickoffExtra,
  resolveResearchFactoryContext,
} from "./research-goal-context.js";
import { RESEARCH_VERTICALS } from "./researcher-factory.js";

test("resolveResearchFactoryContext includes vertical and publish_subdir for factory goals", () => {
  const goals = loadResearchGoals();
  const md = goals.find((g) => g.id === "md_sim_algorithms");
  assert.ok(md?.vertical);
  const ctx = resolveResearchFactoryContext(md!);
  assert.equal(ctx.vertical, "md");
  assert.equal(ctx.publish_subdir, "2026-05/md_sim_algorithms");
  assert.ok(ctx.whitepaper_path.includes("md_sim_algorithms"));
  assert.ok(ctx.prompt_hints.length >= 1);
});

test("buildResearchGoalKickoffExtra includes vertical block and publish path", () => {
  const goal = loadResearchGoals().find((g) => g.id === "robotics_systems");
  assert.ok(goal);
  const extra = buildResearchGoalKickoffExtra(goal!);
  assert.match(extra, /robotics/);
  assert.match(extra, /Publish subdir/);
  assert.match(extra, /2026-05\/robotics_systems/);
});

test("every factory vertical has kickoff hints in context", () => {
  const goals = loadResearchGoals();
  for (const spec of RESEARCH_VERTICALS) {
    const goal = goals.find((g) => g.vertical === spec.slug);
    assert.ok(goal, `missing loaded goal for ${spec.slug}`);
    const ctx = resolveResearchFactoryContext(goal!);
    assert.ok(ctx.prompt_hints.length >= 1, `no hints for ${spec.slug}`);
  }
});

test("pickNextGoalForAgent for numerics and goal researchers returns vertical goals", () => {
  const goals = loadResearchGoals();
  const numerics = pickNextGoalForAgent("numerics_researcher", goals, {});
  const goalRes = pickNextGoalForAgent("goal_researcher", goals, {});
  assert.ok(numerics?.vertical);
  assert.ok(goalRes?.vertical);
});

test("buildRunInput records factory vertical metadata", () => {
  const goal = loadResearchGoals().find((g) => g.vertical === "physics")!;
  const ctx = resolveResearchFactoryContext(goal);
  const input = buildRunInput({
    agentId: "numerics_researcher",
    backend: "mock",
    systemPrompt: "sys",
    userMessage: "user",
    cwd: "/tmp",
    dryRun: false,
    mock: true,
    researchGoalId: ctx.goal_id,
    researchVertical: ctx.vertical,
    publishSubdir: ctx.publish_subdir,
  });
  assert.equal(input.research_goal_id, "physics_sim");
  assert.equal(input.research_vertical, "physics");
  assert.equal(input.publish_subdir, "2026-05/physics_sim");
});
