import { buildHeapPlan, parseHeapPlanFromBriefing, type HeapPlan } from "../heap/plan.js";
import { taskFingerprint } from "../heap/task-queue.js";
import { listHandoffs } from "../handoffs/handoff-store.js";
import { buildImplementationQueue } from "../preflight/implementation-queue.js";
import { loadCachedBriefing } from "../briefing/load-cached-briefing.js";
import { runPreflight, resolveBenchmarksRoot } from "../preflight.js";
import { loadResearchGoals, resolveGoalAgent } from "../research-goals/load-goals.js";
import { loadResearchSession } from "../research-sessions/session-store.js";
import type { AgentId } from "../types.js";
import type { ControlPlaneState } from "./types.js";
import { isHandoffRunInProgress } from "../lanes/handoff-run-coordinator.js";
import { isAsyncSwarmRunning } from "../async-swarm/async-swarm-state.js";
import { laneRuntimeSnapshot } from "../lanes/lane-runtime.js";
import { pushBriefingDerivedWorkItems } from "./briefing-work-items.js";

export interface AgentWorkQueueItem {
  id: string;
  agent_id: AgentId | string;
  source: "heap" | "handoff" | "research_focus" | "research_hypothesis" | "implementation" | "recommended";
  priority: number;
  reason: string;
  status: "pending" | "in_progress" | "blocked";
  meta?: Record<string, string | number | undefined>;
}

export interface AgentWorkQueueSnapshot {
  generated_at: string;
  items: AgentWorkQueueItem[];
  /** Per-agent pending/in-progress work (async workers pick from their list). */
  by_agent: Record<string, AgentWorkQueueItem[]>;
  swarm: {
    async_swarm_running: boolean;
    handoff_run_in_progress: boolean;
    lanes: ReturnType<typeof laneRuntimeSnapshot>;
  };
}

function extractRecommended(briefing: unknown): Array<{ agent: string; reason: string }> {
  if (!briefing || typeof briefing !== "object") return [];
  const rec = (briefing as Record<string, unknown>).recommended_agents;
  if (!Array.isArray(rec)) return [];
  return rec.filter(
    (r): r is { agent: string; reason: string } =>
      r && typeof r === "object" && typeof r.agent === "string" && typeof r.reason === "string",
  );
}

function heapPlanFromBriefing(briefing: unknown): HeapPlan {
  let heapPlan = parseHeapPlanFromBriefing(briefing);
  if (!heapPlan) {
    heapPlan = buildHeapPlan(extractRecommended(briefing));
  }
  return heapPlan;
}

function pushHeapTasks(
  items: AgentWorkQueueItem[],
  heapPlan: HeapPlan,
  seen: Set<string>,
): void {
  for (const ht of heapPlan.flat_tasks) {
    const id = `heap:${ht.coordinator}:${ht.agent}:${taskFingerprint(ht.agent, ht.reason)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      agent_id: ht.agent,
      source: "heap",
      priority: 50 + Math.min(10, ht.priority ?? 0),
      reason: `[${ht.coordinator}] ${ht.reason}`,
      status: "pending",
      meta: { coordinator: ht.coordinator },
    });
  }
}

export function groupAgentWorkQueue(items: AgentWorkQueueItem[]): Record<string, AgentWorkQueueItem[]> {
  const by: Record<string, AgentWorkQueueItem[]> = {};
  for (const item of items) {
    const id = String(item.agent_id);
    (by[id] ??= []).push(item);
  }
  for (const key of Object.keys(by)) {
    by[key].sort((a, b) => b.priority - a.priority);
  }
  return by;
}

/** Next pending item for an async worker (highest priority first). */
export function pickNextWorkForAgent(
  agentId: string,
  snapshot: Pick<AgentWorkQueueSnapshot, "items" | "by_agent">,
): AgentWorkQueueItem | null {
  const list = snapshot.by_agent[agentId] ?? snapshot.items.filter((i) => i.agent_id === agentId);
  return list.find((i) => i.status === "pending") ?? null;
}

export async function buildAgentWorkQueue(state: ControlPlaneState): Promise<AgentWorkQueueSnapshot> {
  const items: AgentWorkQueueItem[] = [];
  const seen = new Set<string>();
  const benchmarksRoot = resolveBenchmarksRoot();
  let briefing: unknown = loadCachedBriefing();
  if (!briefing || (typeof briefing === "object" && !Object.keys(briefing as object).length)) {
    const preflight = runPreflight(benchmarksRoot, true);
    briefing = preflight.briefing ?? preflight;
  }

  const heapPlan = heapPlanFromBriefing(briefing);
  pushHeapTasks(items, heapPlan, seen);

  for (const rec of extractRecommended(briefing)) {
    const id = `rec:${rec.agent}:${taskFingerprint(rec.agent, rec.reason)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      agent_id: rec.agent,
      source: "recommended",
      priority: 45,
      reason: rec.reason,
      status: "pending",
    });
  }

  const org = briefing as Record<string, unknown>;
  const openPlan = (org.org_roadmap as Record<string, unknown> | undefined)?.master_plan_open_items;
  if (typeof openPlan === "number" && openPlan > 0) {
    const id = "plan:open_items";
    if (!seen.has(id)) {
      seen.add(id);
      items.push({
        id,
        agent_id: "plan_verifier",
        source: "recommended",
        priority: 48,
        reason: `${openPlan} master-plan open items`,
        status: "pending",
      });
    }
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

  try {
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
  } catch {
    /* handoffs table may be missing — heap + recommended still populate queue */
  }

  pushBriefingDerivedWorkItems(items, seen, briefing);

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
    by_agent: groupAgentWorkQueue(items),
    swarm: {
      async_swarm_running: isAsyncSwarmRunning(),
      handoff_run_in_progress: isHandoffRunInProgress(),
      lanes: laneRuntimeSnapshot(),
    },
  };
}
