import { buildHeapTaskQueue } from "../heap/task-queue.js";
import { listHandoffs } from "../handoffs/handoff-store.js";
import { buildImplementationQueue } from "../preflight/implementation-queue.js";
import { runPreflight, resolveBenchmarksRoot } from "../preflight.js";
import { loadResearchGoals, resolveGoalAgent } from "../research-goals/load-goals.js";
import { loadResearchSession } from "../research-sessions/session-store.js";
import type { AgentId } from "../types.js";
import type { ControlPlaneState } from "./types.js";
import { isHandoffRunInProgress } from "../lanes/handoff-run-coordinator.js";
import { isAsyncSwarmRunning } from "../async-swarm/async-swarm-state.js";
import { laneRuntimeSnapshot } from "../lanes/lane-runtime.js";

export interface AgentWorkQueueItem {
  id: string;
  agent_id: AgentId | string;
  source: "heap" | "handoff" | "research_focus" | "research_hypothesis" | "implementation";
  priority: number;
  reason: string;
  status: "pending" | "in_progress" | "blocked";
  meta?: Record<string, string | number | undefined>;
}

export interface AgentWorkQueueSnapshot {
  generated_at: string;
  items: AgentWorkQueueItem[];
  swarm: {
    async_swarm_running: boolean;
    handoff_run_in_progress: boolean;
    lanes: ReturnType<typeof laneRuntimeSnapshot>;
  };
}

export async function buildAgentWorkQueue(state: ControlPlaneState): Promise<AgentWorkQueueSnapshot> {
  const items: AgentWorkQueueItem[] = [];
  const benchmarksRoot = resolveBenchmarksRoot();
  const preflight = runPreflight(benchmarksRoot, false);
  const briefing = preflight.briefing ?? preflight;
  const briefingHash = state.last_briefing_hash ?? "";

  const { tasks } = buildHeapTaskQueue(briefing, state, {
    briefingHash,
    cooldownMs: Number(process.env.LI_AGENTS_COOLDOWN_MS ?? 300_000),
    maxTasks: Number(process.env.LI_SUPERVISOR_MAX_TASKS ?? 8),
  });
  for (const t of tasks) {
    items.push({
      id: `heap:${t.fingerprint}`,
      agent_id: t.agentId,
      source: "heap",
      priority: 50,
      reason: t.reason,
      status: "pending",
      meta: { coordinator: t.coordinator },
    });
  }

  const implQ = buildImplementationQueue(briefing);
  for (let i = 0; i < implQ.work_queue.length; i++) {
    const w = implQ.work_queue[i];
    items.push({
      id: `impl:${i}:${w.repo ?? "lic"}:${w.kind ?? "work"}`,
      agent_id: "code_implementer",
      source: "implementation",
      priority: 60,
      reason: w.reason ?? w.title ?? String(w.kind ?? "implementation"),
      status: "pending",
      meta: { repo: w.repo, kind: w.kind },
    });
  }

  const handoffs = await listHandoffs({ status: ["pending", "pending_placement"], limit: 30 });
  for (const h of handoffs) {
    const agent =
      h.status === "pending_placement" ? "package_architect" : (h.to_agents?.[0] ?? "code_implementer");
    items.push({
      id: `handoff:${h.handoff_id}`,
      agent_id: agent,
      source: "handoff",
      priority: h.status === "pending_placement" ? 90 : 80,
      reason:
        typeof h.work?.summary === "string" ? h.work.summary : `handoff ${h.status}`,
      status: "pending",
      meta: { handoff_id: h.handoff_id, goal: h.research_goal_id ?? undefined },
    });
  }

  for (const goal of loadResearchGoals()) {
    if (goal.enabled === false) continue;
    const agentId = resolveGoalAgent(goal);
    const session = await loadResearchSession(agentId);
    if (!session) continue;

    if (session.current_focus) {
      items.push({
        id: `research:${session.session_id}:current`,
        agent_id: agentId,
        source: "research_focus",
        priority: 70,
        reason: `${session.current_focus.kind}: ${session.current_focus.target}`,
        status: "in_progress",
        meta: {
          hypothesis_status: session.current_focus.hypothesis_status,
          goal: goal.id,
        },
      });
    }
    for (let i = 0; i < session.queue.length; i++) {
      const f = session.queue[i];
      items.push({
        id: `research:${session.session_id}:q:${i}`,
        agent_id: agentId,
        source: "research_focus",
        priority: 40 - i,
        reason: `${f.kind}: ${f.target}`,
        status: "pending",
      });
    }
    for (const hyp of session.hypotheses ?? []) {
      if (hyp.status !== "falsified" && hyp.status !== "deferred") continue;
      if (!hyp.retest_allowed) continue;
      items.push({
        id: `hypothesis:${hyp.id}:retest`,
        agent_id: agentId,
        source: "research_hypothesis",
        priority: 55,
        reason: `retest ${hyp.status} hypothesis: ${hyp.statement.slice(0, 120)}`,
        status: "pending",
        meta: { hypothesis_id: hyp.id, prior_status: hyp.status },
      });
    }
  }

  items.sort((a, b) => b.priority - a.priority);

  return {
    generated_at: new Date().toISOString(),
    items,
    swarm: {
      async_swarm_running: isAsyncSwarmRunning(),
      handoff_run_in_progress: isHandoffRunInProgress(),
      lanes: laneRuntimeSnapshot(),
    },
  };
}
