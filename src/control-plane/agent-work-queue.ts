import { buildHeapPlan, parseHeapPlanFromBriefing, type HeapPlan } from "../heap/plan.js";
import { taskFingerprint } from "../heap/task-queue.js";
import { listHandoffs } from "../handoffs/handoff-store.js";
import { buildImplementationQueue } from "../preflight/implementation-queue.js";
import { loadCachedBriefing } from "../briefing/load-cached-briefing.js";
import { loadResearchGoals, resolveGoalAgent } from "../research-goals/load-goals.js";
import { listInProgressResearchSessions } from "../research-sessions/session-store.js";
import { dbEnabled } from "../db/client.js";
import { loadWorkQueueFromDb, syncWorkQueueToDb } from "../db/queued-tasks.js";
import { saveWorkQueueSnapshotToDb } from "../db/work-queue-snapshot.js";
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

export interface BuildAgentWorkQueueOptions {
  /** Skip per-goal research session DB reads (faster for dev:all readiness). */
  light?: boolean;
}

const QUEUE_CACHE_MS = Number(process.env.LI_QUEUE_CACHE_MS ?? 15_000);
/** Serve cached queue up to this age while a refresh runs in the background. */
const QUEUE_STALE_SERVE_MS = Number(process.env.LI_QUEUE_STALE_SERVE_MS ?? 120_000);
const HANDOFFS_CACHE_MS = Number(process.env.LI_HANDOFFS_CACHE_MS ?? 10_000);

let queueCache: { at: number; key: string; snapshot: AgentWorkQueueSnapshot } | null = null;
let queueBuildInFlight: { key: string; promise: Promise<AgentWorkQueueSnapshot> } | null = null;
let handoffsCache: {
  at: number;
  key: string;
  items: Awaited<ReturnType<typeof listHandoffs>>;
} | null = null;
let queueWarmerStarted = false;

export function resetAgentWorkQueueCacheForTests(): void {
  queueCache = null;
  queueBuildInFlight = null;
  handoffsCache = null;
  queueWarmerStarted = false;
}

function queueCacheKey(state: ControlPlaneState, options: BuildAgentWorkQueueOptions): string {
  return `${state.updated_at ?? ""}:${options.light ? "light" : "full"}`;
}

export function peekAgentWorkQueueSnapshot(
  state: ControlPlaneState,
  options: BuildAgentWorkQueueOptions = {},
): AgentWorkQueueSnapshot | null {
  const key = queueCacheKey(state, options);
  if (!queueCache || queueCache.key !== key) return null;
  if (Date.now() - queueCache.at > QUEUE_STALE_SERVE_MS) return null;
  return queueCache.snapshot;
}

/** Refresh queue in the background — never blocks HTTP handlers. */
export function scheduleAgentWorkQueueRefresh(
  state: ControlPlaneState,
  options: BuildAgentWorkQueueOptions = {},
): void {
  const key = queueCacheKey(state, options);
  if (queueCache && queueCache.key === key && Date.now() - queueCache.at < QUEUE_CACHE_MS) {
    return;
  }
  if (queueBuildInFlight?.key === key) return;
  void buildAgentWorkQueue(state, options).catch(() => {
    /* logged in buildAgentWorkQueueInner callers */
  });
}

export function startAgentWorkQueueWarmer(getState: () => ControlPlaneState): void {
  if (queueWarmerStarted) return;
  queueWarmerStarted = true;
  const intervalMs = Number(process.env.LI_QUEUE_WARM_MS ?? 30_000);
  setInterval(() => {
    try {
      scheduleAgentWorkQueueRefresh(getState(), { light: true });
    } catch {
      /* ignore */
    }
  }, intervalMs).unref();
}

async function listHandoffsCached(
  params: Parameters<typeof listHandoffs>[0],
): Promise<Awaited<ReturnType<typeof listHandoffs>>> {
  const key = JSON.stringify(params);
  const now = Date.now();
  if (handoffsCache && handoffsCache.key === key && now - handoffsCache.at < HANDOFFS_CACHE_MS) {
    return handoffsCache.items;
  }
  const items = await listHandoffs(params);
  handoffsCache = { at: now, key, items };
  return items;
}

async function buildAgentWorkQueueInner(
  state: ControlPlaneState,
  options: BuildAgentWorkQueueOptions,
): Promise<AgentWorkQueueSnapshot> {
  const light = options.light ?? false;
  const items: AgentWorkQueueItem[] = [];
  const seen = new Set<string>();
  // Never run sync preflight on the HTTP hot path — maintenance lane refreshes briefing on disk.
  const briefing: unknown = loadCachedBriefing() ?? {};

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
    const handoffs = await listHandoffsCached({ status: ["pending", "pending_placement"], limit: 30 });
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

  if (!light) {
    const sessionsByAgent = new Map(
      (await listInProgressResearchSessions()).map((s) => [s.agent_id, s]),
    );
    for (const goal of loadResearchGoals()) {
      if (goal.enabled === false) continue;
      const agentId = resolveGoalAgent(goal);
      const session = sessionsByAgent.get(agentId);
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
  }

  items.sort((a, b) => b.priority - a.priority);

  const snapshot: AgentWorkQueueSnapshot = {
    generated_at: new Date().toISOString(),
    items,
    by_agent: groupAgentWorkQueue(items),
    swarm: {
      async_swarm_running: isAsyncSwarmRunning(),
      handoff_run_in_progress: isHandoffRunInProgress(),
      lanes: laneRuntimeSnapshot(),
    },
  };

  if (dbEnabled() && state.last_briefing_hash && items.length > 0) {
    void syncWorkQueueToDb(state.last_briefing_hash, items).catch(() => {
      /* background denormalize for indexed dashboard reads */
    });
    void saveWorkQueueSnapshotToDb(state.last_briefing_hash, snapshot).catch(() => {
      /* materialized queue for read-only dashboard API */
    });
  }

  return snapshot;
}

function dbRowsToQueueItems(
  rows: Awaited<ReturnType<typeof loadWorkQueueFromDb>>,
): AgentWorkQueueItem[] {
  return rows.map((row) => ({
    id: row.id,
    agent_id: row.agent_id,
    source: row.source as AgentWorkQueueItem["source"],
    priority: row.priority,
    reason: row.reason,
    status: row.status as AgentWorkQueueItem["status"],
    meta: row.meta,
  }));
}

export async function buildAgentWorkQueue(
  state: ControlPlaneState,
  options: BuildAgentWorkQueueOptions = {},
): Promise<AgentWorkQueueSnapshot> {
  const key = queueCacheKey(state, options);
  const now = Date.now();
  if (queueCache && queueCache.key === key && now - queueCache.at < QUEUE_CACHE_MS) {
    return queueCache.snapshot;
  }

  if (options.light && dbEnabled() && state.last_briefing_hash) {
    const dbRows = await loadWorkQueueFromDb(state.last_briefing_hash);
    if (dbRows.length > 0) {
      const items = dbRowsToQueueItems(dbRows);
      const snapshot: AgentWorkQueueSnapshot = {
        generated_at: new Date().toISOString(),
        items,
        by_agent: groupAgentWorkQueue(items),
        swarm: {
          async_swarm_running: isAsyncSwarmRunning(),
          handoff_run_in_progress: isHandoffRunInProgress(),
          lanes: laneRuntimeSnapshot(),
        },
      };
      queueCache = { at: now, key, snapshot };
      scheduleAgentWorkQueueRefresh(state, options);
      return snapshot;
    }
  }
  if (!queueBuildInFlight || queueBuildInFlight.key !== key) {
    queueBuildInFlight = {
      key,
      promise: buildAgentWorkQueueInner(state, options).finally(() => {
        queueBuildInFlight = null;
      }),
    };
  }
  const snapshot = await queueBuildInFlight.promise;
  queueCache = { at: Date.now(), key, snapshot };
  return snapshot;
}
