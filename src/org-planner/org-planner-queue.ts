import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listHandoffs } from "../handoffs/handoff-store.js";
import { goalAllowsImplementation, loadGoalScaffold } from "../handoffs/implementation-handoff.js";
import { loadResearchGoals } from "../research-goals/load-goals.js";
import { issueRef } from "../org-issues/org-issue-supervisor-config.js";
import {
  orgPlannerIncludeNeedsTriage,
  orgPlannerResearchEnabled,
  researchPlanRef,
} from "./org-planner-supervisor-config.js";
import {
  sprintDataDir,
  writePlannerQueue,
  type OrgPlannerQueue,
  type QueuedIssuePlan,
  type QueuedResearchPlan,
} from "./org-planner-coordination.js";
import { agentsPackageRoot } from "../runner.js";

function readIssueBucket(bucket: string, root: string): QueuedIssuePlan[] {
  const path = join(sprintDataDir(root), "org-issue-queue.json");
  if (!existsSync(path)) return [];
  const q = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const rows = q[bucket];
  if (!Array.isArray(rows)) return [];
  const out: QueuedIssuePlan[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const repo = String(r.repo ?? "");
    const number = Number(r.number);
    if (!repo || !Number.isFinite(number)) continue;
    out.push({
      kind: "issue_plan",
      repo,
      number,
      source: bucket,
      priority: bucket === "route_planner" ? 2 : 3,
      title: r.title as string | undefined,
      html_url: r.html_url as string | undefined,
      classification_note: r.classification_note as string | undefined,
    });
  }
  return out;
}

async function collectResearchPlans(root: string): Promise<QueuedResearchPlan[]> {
  if (!orgPlannerResearchEnabled()) return [];

  const out: QueuedResearchPlan[] = [];
  const seen = new Set<string>();

  const handoffs = await listHandoffs({
    status: ["pending", "claimed"],
    toAgent: "issue_planner",
    limit: 50,
  });

  for (const h of handoffs) {
    const goalId = h.research_goal_id;
    const sessionId = h.research_session_id;
    if (!goalId || !sessionId) continue;
    const key = researchPlanRef(goalId, sessionId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: "research_plan",
      goal_id: goalId,
      session_id: sessionId,
      handoff_id: h.handoff_id,
      source: h.work?.kind === "research_implementation_plan" ? "handoff" : "handoff_to",
      allow_implementation: goalAllowsImplementation(goalId),
      priority: 1,
    });
  }

  for (const goal of loadResearchGoals()) {
    if (!goal.enabled) continue;
    if (!goalAllowsImplementation(goal.id)) continue;
    if (loadGoalScaffold(goal.id)) continue;

    const sessionId = `backfill-${goal.id}`;
    const key = researchPlanRef(goal.id, sessionId);
    if (seen.has(key)) continue;

    const pendingHandoff = handoffs.some((h) => h.research_goal_id === goal.id);
    if (pendingHandoff) continue;

    seen.add(key);
    out.push({
      kind: "research_plan",
      goal_id: goal.id,
      session_id: sessionId,
      source: "goal_scaffold_missing",
      allow_implementation: true,
      priority: 2,
    });
  }

  out.sort((a, b) => a.priority - b.priority);
  return out;
}

/** Refresh merged planner queue from issue buckets + research handoffs. */
export async function refreshPlannerQueue(root = agentsPackageRoot()): Promise<OrgPlannerQueue> {
  const issuePlans: QueuedIssuePlan[] = readIssueBucket("route_planner", root);
  if (orgPlannerIncludeNeedsTriage()) {
    const triage = readIssueBucket("needs_triage", root);
    const seen = new Set(issuePlans.map((i) => `${i.repo}#${i.number}`));
    for (const item of triage) {
      const key = `${item.repo}#${item.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issuePlans.push(item);
    }
  }

  const researchPlans = await collectResearchPlans(root);

  const queue: OrgPlannerQueue = {
    report: {
      issue_plan: issuePlans.length,
      research_plan: researchPlans.length,
      total: issuePlans.length + researchPlans.length,
    },
    issue_plan: issuePlans,
    research_plan: researchPlans,
  };

  writePlannerQueue(queue, root);
  return queue;
}

export function issuePlanRef(repo: string, number: number): string {
  return issueRef(repo, number);
}
