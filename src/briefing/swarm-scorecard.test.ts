import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProvabilityScorecard,
  buildResearchGoalsStatus,
  enrichBriefingWithScorecards,
} from "./swarm-scorecard.js";

test("buildResearchGoalsStatus lists provability goal", () => {
  const rows = buildResearchGoalsStatus();
  assert.ok(rows.some((r) => r.goal_id === "provability_holes"));
});

test("enrichBriefingWithScorecards adds scorecard keys", async () => {
  const out = await enrichBriefingWithScorecards({ recommended_agents: [] });
  assert.ok(out.swarm_scorecard);
  assert.ok(Array.isArray(out.research_goals_status));
  assert.ok(out.provability_scorecard);
});

test("buildProvabilityScorecard reads plan audit", () => {
  const card = buildProvabilityScorecard({
    plan_completion_audit: { findings: [{}, {}] },
  });
  assert.equal((card as { open_plan_findings: number }).open_plan_findings, 2);
});
