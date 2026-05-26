import { randomUUID } from "node:crypto";
import { buildResearchGoalKickoffExtra } from "../research-goals/research-goal-context.js";
import type { ResearchGoal } from "../research-goals/load-goals.js";
import type { AgentId } from "../types.js";
import {
  advanceResearchSession,
  loadResearchSession,
  saveResearchSession,
} from "./session-store.js";
import type { ResearchFocus, ResearchSession } from "./types.js";

/** Agents that use multi-cycle research sessions (factory verticals + aux goals). */
export const RESEARCH_SESSION_AGENT_IDS = [
  "numerics_researcher",
  "goal_researcher",
  "proof_gap_researcher",
  "stdlib_researcher",
] as const satisfies readonly AgentId[];

const SESSION_AGENTS = new Set<AgentId>(RESEARCH_SESSION_AGENT_IDS);

export function agentUsesResearchSession(agentId: AgentId): boolean {
  return SESSION_AGENTS.has(agentId);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function defaultFocusQueueForGoal(goal: ResearchGoal): ResearchFocus[] {
  switch (goal.id) {
    case "stdlib_ecosystem":
      return [
        { kind: "inventory_std_tree", target: "lic/std/**" },
        { kind: "audit_package", target: "li-std-core (sample)" },
        { kind: "gap_vs_sota", target: "linear algebra stdlibs" },
        { kind: "synthesize_step", target: "cycle summary" },
      ];
    case "provability_holes":
      return [
        { kind: "read_register", target: "lic/docs/verification/provability-gaps.md" },
        { kind: "trusted_surface", target: "lic/docs/semantics/trusted.lean" },
        { kind: "contract_tier", target: "li-tests contract tiers" },
        { kind: "synthesize_step", target: "proof-gap digest" },
      ];
    default:
      return [
        { kind: "survey_sota", target: goal.title },
        { kind: "li_gap_analysis", target: `goal:${goal.id}` },
        { kind: "digest", target: `docs/research/goals/${goal.id}` },
      ];
  }
}

/** Session stuck in_progress with an empty queue but a stale current_focus (pre-fix dequeue bug). */
export function isZombieInProgressSession(session: ResearchSession): boolean {
  if (session.status !== "in_progress" || session.queue.length > 0) return false;
  return session.current_focus != null;
}

/** Clear stale focus so cycle_complete can apply and the lane can rotate goals. */
export async function repairZombieResearchSession(
  agentId: AgentId,
): Promise<ResearchSession | null> {
  const session = await loadResearchSession(agentId);
  if (!session || !isZombieInProgressSession(session)) return session;
  const repaired: ResearchSession = {
    ...session,
    current_focus: null,
    status: "cycle_complete",
    updated_at: nowIso(),
  };
  await saveResearchSession(repaired);
  return repaired;
}

export async function findAnyInProgressSession(): Promise<ResearchSession | null> {
  for (const agentId of SESSION_AGENTS) {
    let s = await loadResearchSession(agentId);
    if (!s) continue;
    if (isZombieInProgressSession(s)) {
      s = await repairZombieResearchSession(agentId);
      if (s?.status === "cycle_complete") continue;
    }
    if (s?.status === "in_progress") return s;
  }
  return null;
}

export async function ensureSessionForGoal(
  agentId: AgentId,
  goal: ResearchGoal,
): Promise<ResearchSession> {
  const existing = await loadResearchSession(agentId);
  if (existing && existing.goal_id === goal.id) return existing;

  const queue = defaultFocusQueueForGoal(goal);
  const [first, ...rest] = queue;
  const session: ResearchSession = {
    session_id: randomUUID(),
    agent_id: agentId,
    goal_id: goal.id,
    cycle: existing ? existing.cycle + 1 : 1,
    status: "in_progress",
    current_focus: first ?? null,
    queue: rest,
    hypotheses: existing?.hypotheses ?? [],
    completed_steps: [],
    artifacts: {
      progress_md: `lic/docs/ecosystem/research-sessions/${goal.id}-cycle.md`,
    },
    connections: [],
    deferred_findings: [],
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await saveResearchSession(session);
  return session;
}

export function buildGoalKickoffBlock(goal: ResearchGoal, session: ResearchSession): string {
  return buildResearchGoalKickoffExtra(goal, session);
}

export async function completeResearchRunStep(
  agentId: AgentId,
  runId: string,
  status: string,
  summary: string,
): Promise<ResearchSession | null> {
  const session = await loadResearchSession(agentId);
  if (!session?.current_focus) return session;

  const stepId = `${session.current_focus.kind}-${session.completed_steps.length + 1}`;
  return advanceResearchSession(agentId, {
    completed_step: {
      id: stepId,
      summary,
      artifact: session.artifacts?.progress_md,
    },
    dequeue: true,
    last_run_id: runId,
    last_run_status: status,
  });
}

export async function markResearchRunFailed(
  agentId: AgentId,
  runId: string,
  status: string,
): Promise<void> {
  const session = await loadResearchSession(agentId);
  if (!session) return;
  await saveResearchSession({
    ...session,
    last_run_id: runId,
    last_run_status: status,
    updated_at: nowIso(),
  });
}
