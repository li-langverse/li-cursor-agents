import { resolveCursorApiKey, resolveCursorEnvFileHint } from "../env.js";
import { runAgent, agentsPackageRoot, shouldUseMock } from "../runner.js";
import { workerConsole } from "../worker/worker-console.js";
import type { AgentId } from "../types.js";
import {
  eligibleGoals,
  loadResearchGoals,
  resolveGoalAgent,
  type ResearchGoal,
} from "../research-goals/load-goals.js";
import { buildResearchGoalKickoffExtra } from "../research-goals/research-goal-context.js";
import { loadLaneState } from "../lanes/lane-state.js";
import { getAgent } from "../agents/registry.js";
import { buildOrgGithubMcpServer, ORG_GITHUB_MCP_ID } from "../mcp/mcp-config.js";
import {
  orgResearchResearcherAgentId,
  parseResearchRef,
} from "./org-research-supervisor-config.js";
import { buildResearchDimensionTail } from "./org-research-instructions.js";

const ORG_GITHUB_MCP_AGENT_IDS = new Set<AgentId>(["novel_gap_researcher", "gap_explorer"]);

export interface OrgResearchCycleOptions {
  researchRef: string;
  workerId: string;
  mock?: boolean;
  dryRun?: boolean;
}

export interface OrgResearchCycleResult {
  ok: boolean;
  status: "completed" | "failed";
  agentId: string;
  goalId: string;
  dimension: string;
  stub: boolean;
  error?: string;
  agentStatus?: string;
  durationMs?: number;
  outputTail?: string;
}

function outputTail(text: string | undefined, max = 1500): string | undefined {
  if (!text?.trim()) return undefined;
  return text.trim().slice(-max);
}

function findGoal(goalId: string): ResearchGoal | undefined {
  return loadResearchGoals().find((g) => g.id === goalId);
}

function pickEligibleGoal(preferredGoalId: string): ResearchGoal | null {
  const state = loadLaneState();
  const goals = loadResearchGoals().filter((g) => g.enabled !== false);
  const preferred = goals.find((g) => g.id === preferredGoalId);
  if (preferred) return preferred;
  return eligibleGoals(goals, state.goal_last_run_at, Date.now())[0] ?? null;
}

function resolveAgentId(goal: ResearchGoal | null): AgentId {
  if (goal) return resolveGoalAgent(goal);
  const fallback = orgResearchResearcherAgentId();
  return fallback as AgentId;
}

export function buildResearchInstruction(
  goal: ResearchGoal,
  dimension: string,
  workerId: string,
): string {
  const base = buildResearchGoalKickoffExtra(goal);
  return [base, "", buildResearchDimensionTail(goal, dimension, workerId)].join("\n");
}

/** Run Cursor SDK researcher agent for one goal+dimension pair. */
export async function runOrgResearchCycle(
  options: OrgResearchCycleOptions,
): Promise<OrgResearchCycleResult> {
  const parsed = parseResearchRef(options.researchRef);
  if (!parsed) {
    return {
      ok: false,
      status: "failed",
      agentId: orgResearchResearcherAgentId(),
      goalId: "",
      dimension: "",
      stub: false,
      error: `invalid research ref: ${options.researchRef}`,
    };
  }

  const { goalId, dimension } = parsed;
  const goal = pickEligibleGoal(goalId);
  const agentId = resolveAgentId(goal);
  const agentDef = getAgent(agentId);
  const mock = shouldUseMock(options.mock ?? false);

  if (!goal) {
    const msg = `no eligible research goal for ${goalId} — check config/research-goals.yaml`;
    workerConsole("org-researcher", "warn", msg);
    return {
      ok: false,
      status: "failed",
      agentId,
      goalId,
      dimension,
      stub: true,
      error: msg,
    };
  }

  if (!agentDef) {
    const msg =
      `researcher agent '${agentId}' not in registry — wire LI_ORG_RESEARCH_RESEARCHER_AGENT or add to registry`;
    workerConsole("org-researcher", "warn", `[stub] ${msg}`);
    return {
      ok: true,
      status: "completed",
      agentId,
      goalId: goal.id,
      dimension,
      stub: true,
      outputTail: msg,
    };
  }

  if (!mock && !options.dryRun && !resolveCursorApiKey()) {
    const hint = resolveCursorEnvFileHint();
    const msg =
      `CURSOR_API_KEY required for org-researcher (set in li-agents-secrets on K8s or ${hint} locally).`;
    workerConsole("org-researcher", "ERROR", msg);
    return {
      ok: false,
      status: "failed",
      agentId,
      goalId: goal.id,
      dimension,
      stub: false,
      error: msg,
    };
  }

  const instruction = buildResearchInstruction(goal, dimension, options.workerId);
  workerConsole(
    "org-researcher",
    "info",
    `running agent ${agentId} for ${options.researchRef} dimension=${dimension}`,
  );

  const started = Date.now();
  let agentResult;
  try {
    const extraMcpServers =
      mock || options.dryRun || !ORG_GITHUB_MCP_AGENT_IDS.has(agentId)
        ? undefined
        : { [ORG_GITHUB_MCP_ID]: buildOrgGithubMcpServer() };

    agentResult = await runAgent({
      agentId,
      cwd: agentsPackageRoot(),
      mock,
      dryRun: options.dryRun ?? false,
      extraInstruction: instruction,
      extraMcpServers,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "failed",
      agentId,
      goalId: goal.id,
      dimension,
      stub: false,
      error: msg,
      durationMs: Date.now() - started,
    };
  }

  const agentOk = agentResult.status === "finished";
  return {
    ok: agentOk,
    status: agentOk ? "completed" : "failed",
    agentId,
    goalId: goal.id,
    dimension,
    stub: false,
    agentStatus: agentResult.status,
    durationMs: Date.now() - started,
    outputTail: outputTail(agentResult.outputText ?? agentResult.error),
    error: agentOk ? undefined : agentResult.error ?? `agent status ${agentResult.status}`,
  };
}

/** Count eligible research goals for supervisor open_count. */
export function countOpenResearchGoals(): number {
  const state = loadLaneState();
  const goals = loadResearchGoals().filter((g) => g.enabled !== false);
  return eligibleGoals(goals, state.goal_last_run_at, Date.now()).length;
}

/** Ordered queue of goal ids for spawning. */
export function readResearchQueue(): string[] {
  const state = loadLaneState();
  const goals = loadResearchGoals().filter((g) => g.enabled !== false);
  return eligibleGoals(goals, state.goal_last_run_at, Date.now()).map((g) => g.id);
}
