import test from "node:test";
import assert from "node:assert/strict";
import { buildResearchGoalsFromFactory } from "../research-goals/researcher-factory.js";
import {
  ORG_NOVEL_RESEARCH_GOAL_ID,
  buildNovelResearchDimensionBlock,
  buildResearchDimensionTail,
  isOrgNovelResearchGoal,
} from "./org-research-instructions.js";

test("org_novel_research goal exists in factory", () => {
  const goal = buildResearchGoalsFromFactory().find((g) => g.id === ORG_NOVEL_RESEARCH_GOAL_ID);
  assert.ok(goal);
  assert.equal(goal?.agent, "novel_gap_researcher");
  assert.ok(goal?.handoff_to?.includes("issue_planner"));
});

test("novel research dimension block covers sota and competitor lenses", () => {
  const block = buildNovelResearchDimensionBlock("sota-papers", "w-1");
  assert.match(block, /recent research/i);
  assert.match(block, /create_github_issue/);

  const comp = buildNovelResearchDimensionBlock("competitor-gaps", "w-2");
  assert.match(comp, /competitor/i);
});

test("buildResearchDimensionTail uses novel block for org_novel_research", () => {
  const goal = buildResearchGoalsFromFactory().find((g) => g.id === ORG_NOVEL_RESEARCH_GOAL_ID)!;
  assert.ok(isOrgNovelResearchGoal(goal));
  const tail = buildResearchDimensionTail(goal, "org-packages", "w-3");
  assert.match(tail, /whole org/i);
  assert.match(tail, /create_github_repo/);
});
