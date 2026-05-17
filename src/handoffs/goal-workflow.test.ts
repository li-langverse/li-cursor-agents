import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GOAL_IMPLEMENTATION_REPO,
  buildGoalWorkflowExtra,
  isGoalImplementationHandoff,
  resolveGoalImplementationRepo,
} from "./goal-workflow.js";
import type { AgentHandoff } from "./types.js";

function handoff(partial: Partial<AgentHandoff> & Pick<AgentHandoff, "handoff_id">): AgentHandoff {
  const now = new Date().toISOString();
  return {
    from_agent: "goal_researcher",
    to_agents: ["code_implementer"],
    status: "pending",
    work: {},
    created_at: now,
    updated_at: now,
    ...partial,
  };
}

test("resolveGoalImplementationRepo returns lic for goal_implementation kind", () => {
  const h = handoff({
    handoff_id: "a",
    research_goal_id: "game_engine_ux",
    work: { kind: "goal_implementation" },
  });
  assert.equal(isGoalImplementationHandoff(h), true);
  assert.equal(resolveGoalImplementationRepo(h), GOAL_IMPLEMENTATION_REPO);
});

test("resolveGoalImplementationRepo returns undefined for generic implement handoff", () => {
  const h = handoff({
    handoff_id: "b",
    research_goal_id: "web_platform",
    work: { kind: "package_slice" },
  });
  assert.equal(resolveGoalImplementationRepo(h), undefined);
});

test("buildGoalWorkflowExtra lists lic paths for cad_fundamentals", () => {
  const h = handoff({
    handoff_id: "c",
    research_goal_id: "cad_fundamentals",
    work: { kind: "goal_implementation" },
  });
  const block = buildGoalWorkflowExtra(h);
  assert.match(block, /lic/);
  assert.match(block, /cad-fundamentals\.md/);
});
