import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveCursorApiKey, resolveCursorEnvFileHint } from "../env.js";
import { runAgent, agentsPackageRoot, shouldUseMock } from "../runner.js";
import { workerConsole } from "../worker/worker-console.js";
import type { AgentId } from "../types.js";
import { fetchGitHubIssue, postGitHubIssueComment } from "../org-issues/org-issue-github.js";
import { orgName, parseIssueRef } from "../org-issues/org-issue-supervisor-config.js";
import { loadResearchGoals, northStarFitForGoal } from "../research-goals/load-goals.js";
import {
  goalScaffoldPath,
  loadGoalScaffold,
  goalAllowsImplementation,
} from "../handoffs/implementation-handoff.js";
import { listHandoffs, updateHandoff } from "../handoffs/handoff-store.js";
import { enqueueImplementationHandoff } from "../handoffs/implementation-handoff.js";
import {
  orgPlannerAgentId,
  orgPlannerIssuesPerRun,
} from "./org-planner-supervisor-config.js";
import type { PlannerWorkKind } from "./org-planner-coordination.js";
import { sprintDataDir, setPlannerBackoff } from "./org-planner-coordination.js";

export interface OrgPlannerRunOptions {
  planRef: string;
  kind: PlannerWorkKind;
  workerId: string;
  issueRef?: string;
  repo?: string;
  number?: number;
  goalId?: string;
  sessionId?: string;
  handoffId?: string;
  mock?: boolean;
  dryRun?: boolean;
}

export interface OrgPlannerRunResult {
  ok: boolean;
  status: "completed" | "failed";
  agentId: string;
  kind: PlannerWorkKind;
  planReady: boolean;
  error?: string;
  agentStatus?: string;
  durationMs?: number;
  outputTail?: string;
}

function outputTail(text: string | undefined, max = 1500): string | undefined {
  if (!text?.trim()) return undefined;
  return text.trim().slice(-max);
}

function buildIssuePlanInstruction(
  issueRef: string,
  issue: { title: string; body: string | null; html_url: string; labels: string[] },
  workerId: string,
  source?: string,
): string {
  const parsed = parseIssueRef(issueRef);
  const repo = parsed?.repo ?? "lic";
  const labels = issue.labels.length ? issue.labels.join(", ") : "(none)";
  const body = issue.body?.trim() || "(empty body)";
  const maxIssues = orgPlannerIssuesPerRun();

  return [
    "## Assigned GitHub issue (org planner — issue_plan lane)",
    "",
    `- **Issue:** \`${issueRef}\``,
    `- **URL:** ${issue.html_url}`,
    `- **Title:** ${issue.title}`,
    `- **Labels:** ${labels}`,
    `- **Queue source:** ${source ?? "route_planner"}`,
    `- **Worker:** \`${workerId}\``,
    "",
    "### Issue body",
    "",
    body,
    "",
    "---",
    "",
    "## Your task",
    "",
    "You are the **issue_planner** for this single issue. Produce a scoped implementation plan:",
    "",
    "1. Draft plan doc (`docs/superpowers/plans/…` or package doc) aligned with vision + PH tracker",
    "2. Post issue comment with plan summary + links",
    "3. Open **draft PR** with the plan (one issue per PR)",
    "4. Request **`plan-approved`** label (remove `plan-needed` if present)",
    "",
    `Focus on **this issue only** (max ${maxIssues} issues per run policy — you have one).`,
    "**Do not implement product code** unless the issue already has `plan-approved` + linked plan.",
    "",
    "Read first:",
    "- `data/goal-directed-sprints/org-issue-zero.md`",
    "- `prompts/issue-feature-planner.md`",
    "",
    `workflow repo: ${repo}`,
  ].join("\n");
}

function buildResearchPlanInstruction(
  goalId: string,
  sessionId: string,
  workerId: string,
  handoffId?: string,
): string {
  const goal = loadResearchGoals().find((g) => g.id === goalId);
  const scaffoldPath = `config/goal-scaffolds/${goalId}.md`;
  const north = goal ? northStarFitForGoal(goal) : `Plan implementation for ${goalId}`;

  return [
    "## Research → implementation plan (org planner — research_plan lane)",
    "",
    `- **Goal:** \`${goalId}\``,
    `- **Session:** \`${sessionId}\``,
    handoffId ? `- **Handoff:** \`${handoffId}\`` : "",
    `- **Worker:** \`${workerId}\``,
    `- **North star:** ${north}`,
    "",
    "## Your task",
    "",
    "You are **issue_planner** turning research findings into an implementable plan:",
    "",
    `1. Write/update \`${scaffoldPath}\` with v1 scaffold (acceptance criteria, PH/REQ links, file touch list)`,
    "2. Write implementation plan section referencing research session outcomes",
    "3. If placement is unclear, note `needs_placement` for package_architect",
    "4. If scope warrants tracking, open/update a GitHub issue in the appropriate repo",
    "5. Do **not** implement product code in this run",
    "",
    "Read first:",
    "- `config/research-goals.yaml` (goal definition)",
    "- `prompts/issue-feature-planner.md` (plan quality bar)",
    "- Research session output / handoff work summary if available",
    "",
    `Target scaffold path: ${goalScaffoldPath(goalId)}`,
    goal?.allow_implementation
      ? "Goal has `allow_implementation: true` — scaffold unlocks implement handoff after this run."
      : "Goal may not allow direct implementation yet — still produce scaffold + plan for review.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function markHandoffDone(handoffId: string | undefined): Promise<void> {
  if (!handoffId) return;
  await updateHandoff(handoffId, {
    status: "done",
    completed_at: new Date().toISOString(),
  });
}

async function maybeEnqueueImplementHandoff(
  goalId: string,
  sessionId: string,
  agentId: string,
): Promise<void> {
  if (!goalAllowsImplementation(goalId)) return;
  if (!loadGoalScaffold(goalId)) return;
  await enqueueImplementationHandoff({
    goalId,
    sessionId,
    fromAgent: agentId,
  });
}

/** Run Cursor SDK issue_planner for one planner queue item. */
export async function runOrgPlannerCycle(
  options: OrgPlannerRunOptions,
): Promise<OrgPlannerRunResult> {
  const agentId = orgPlannerAgentId() as AgentId;
  const mock = shouldUseMock(options.mock ?? false);

  if (!mock && !options.dryRun && !resolveCursorApiKey()) {
    const hint = resolveCursorEnvFileHint();
    const msg =
      `CURSOR_API_KEY required for org-planner worker (set in li-agents-secrets on K8s or ${hint} locally).`;
    workerConsole("org-planner-worker", "ERROR", msg);
    return {
      ok: false,
      status: "failed",
      agentId,
      kind: options.kind,
      planReady: false,
      error: msg,
    };
  }

  let instruction = "";
  let workflowRepo = "lic";

  if (options.kind === "issue_plan") {
    const issueRef =
      options.issueRef ??
      (options.repo && options.number != null
        ? `${orgName()}/${options.repo}#${options.number}`
        : "");
    const parsed = parseIssueRef(issueRef);
    if (!parsed) {
      return {
        ok: false,
        status: "failed",
        agentId,
        kind: options.kind,
        planReady: false,
        error: `invalid issue ref: ${issueRef}`,
      };
    }
    workflowRepo = parsed.repo;

    let issue;
    try {
      issue = await fetchGitHubIssue(parsed.org, parsed.repo, parsed.number);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
if (/rate limit exceeded|secondary rate limit/i.test(msg)) {
  const ms = Number(process.env.LI_ORG_PLANNER_GH_BACKOFF_MS || 15 * 60_000);
  const until = new Date(Date.now() + (Number.isFinite(ms) ? ms : 15 * 60_000)).toISOString();
  setPlannerBackoff(until, "github_rate_limited");
  return {
    ok: true,
    status: "completed",
    agentId,
    kind: options.kind,
    planReady: false,
    outputTail: "GitHub rate limited - backoff until " + until,
  };
}
return {
        ok: false,
        status: "failed",
        agentId,
        kind: options.kind,
        planReady: false,
        error: msg,
      };
    }

    if (issue.labels.includes("plan-approved")) {
      workerConsole("org-planner-worker", "info", `${issueRef} already plan-approved`);
      return {
        ok: true,
        status: "completed",
        agentId,
        kind: options.kind,
        planReady: true,
        outputTail: "issue already has plan-approved label",
      };
    }

    instruction = buildIssuePlanInstruction(issueRef, issue, options.workerId);
    await postGitHubIssueComment(
      parsed.org,
      parsed.repo,
      parsed.number,
      [
        "**org-planner** claimed this issue for planning.",
        "",
        `- Worker: \`${options.workerId}\``,
        `- Agent: \`${agentId}\``,
        `- Lane: issue_plan`,
      ].join("\n"),
    );
  } else {
    const goalId = options.goalId;
    const sessionId = options.sessionId;
    if (!goalId || !sessionId) {
      return {
        ok: false,
        status: "failed",
        agentId,
        kind: options.kind,
        planReady: false,
        error: "research_plan requires goalId and sessionId",
      };
    }
    instruction = buildResearchPlanInstruction(goalId, sessionId, options.workerId, options.handoffId);
  }

  workerConsole(
    "org-planner-worker",
    "info",
    `running agent ${agentId} kind=${options.kind} ref=${options.planRef}`,
  );

  const started = Date.now();
  let agentResult;
  try {
    agentResult = await runAgent({
      agentId,
      cwd: agentsPackageRoot(),
      mock,
      dryRun: options.dryRun ?? false,
      workflowRepo,
      extraInstruction: instruction,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "failed",
      agentId,
      kind: options.kind,
      planReady: false,
      error: msg,
      durationMs: Date.now() - started,
    };
  }

  let planReady = agentResult.status === "finished";

  if (options.kind === "issue_plan" && options.issueRef) {
    const parsed = parseIssueRef(options.issueRef);
    if (parsed) {
      try {
        const after = await fetchGitHubIssue(parsed.org, parsed.repo, parsed.number);
        planReady = planReady || after.labels.includes("plan-approved");
      } catch {
        /* best-effort */
      }
    }
  }

  if (options.kind === "research_plan" && options.goalId) {
    planReady = planReady || Boolean(loadGoalScaffold(options.goalId));
    if (planReady) {
      await markHandoffDone(options.handoffId);
      await maybeEnqueueImplementHandoff(options.goalId, options.sessionId ?? "", agentId);
    }
  }

  const ok = planReady || agentResult.status === "finished";

  return {
    ok,
    status: ok ? "completed" : "failed",
    agentId,
    kind: options.kind,
    planReady,
    agentStatus: agentResult.status,
    durationMs: Date.now() - started,
    outputTail: outputTail(agentResult.outputText ?? agentResult.error),
    error: ok ? undefined : agentResult.error ?? `agent status ${agentResult.status}`,
  };
}

export function queueEntrySource(repo: string, number: number): string | undefined {
  const path = join(sprintDataDir(), "org-planner-queue.json");
  if (!existsSync(path)) return undefined;
  const q = JSON.parse(readFileSync(path, "utf8")) as {
    issue_plan?: Array<{ repo: string; number: number; source?: string }>;
  };
  return q.issue_plan?.find((r) => r.repo === repo && r.number === number)?.source;
}

export async function claimHandoffForPlanning(handoffId: string | undefined): Promise<void> {
  if (!handoffId) return;
  const rows = await listHandoffs({ status: ["pending", "claimed"], toAgent: "issue_planner", limit: 50 });
  const target = rows.find((h) => h.handoff_id === handoffId);
  if (target && target.status === "pending") {
    await updateHandoff(handoffId, { status: "claimed", claimed_at: new Date().toISOString() });
  }
}
