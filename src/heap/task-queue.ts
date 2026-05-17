import { createHash } from "node:crypto";
import type { AgentId } from "../types.js";
import type { ControlPlaneState, QueuedAgentTask } from "../control-plane/types.js";
import { agentKitBumpActive } from "../preflight/agent-kit-sync.js";
import { buildHeapPlan, parseHeapPlanFromBriefing, type HeapPlan, type HeapTask } from "./plan.js";
import type { CoordinatorId } from "./coordinators.js";

export function taskFingerprint(agentId: string, reason: string): string {
  return createHash("sha256").update(`${agentId}\0${reason}`).digest("hex").slice(0, 20);
}

const COOLDOWN_TERMINAL_STATUSES = new Set(["finished", "error", "incomplete", "cancelled"]);

function wasRecentlyRun(
  recent: ControlPlaneState["recent_tasks"],
  fingerprint: string,
  briefingHash: string,
  cooldownMs: number,
): boolean {
  const cutoff = Date.now() - cooldownMs;
  return recent.some(
    (t) =>
      t.fingerprint === fingerprint &&
      t.briefing_hash === briefingHash &&
      new Date(t.finished_at).getTime() >= cutoff &&
      COOLDOWN_TERMINAL_STATUSES.has(t.status),
  );
}

/** Heap-ordered queue: respects coordinator priority; root never exceeds per-coordinator caps. */
export function buildHeapTaskQueue(
  briefing: unknown,
  state: ControlPlaneState,
  options: { briefingHash: string; cooldownMs: number; maxTasks: number },
): {
  tasks: QueuedAgentTask[];
  skippedCooldown: number;
  heapPlan: HeapPlan;
  activeCoordinator?: CoordinatorId;
} {
  let heapPlan = parseHeapPlanFromBriefing(briefing);
  const recommended = extractRecommended(briefing);
  if (!heapPlan) {
    heapPlan = buildHeapPlan(recommended);
  }

  const flatTasks = limitNumericsTasksPerTick(heapPlan.flat_tasks, state);

  const tasks: QueuedAgentTask[] = [];
  let skippedCooldown = 0;
  let activeCoordinator: CoordinatorId | undefined;

  const stopped = new Set(state.stopped_agents ?? []);
  const kitBump = agentKitBumpActive(briefing);

  for (const ht of flatTasks) {
    const agentId = ht.agent;
    if (stopped.has(agentId)) continue;
    const fp = taskFingerprint(agentId, ht.reason);
    const bypassCooldown = agentId === "agent_kit_maintainer" && kitBump;
    if (
      !bypassCooldown &&
      wasRecentlyRun(state.recent_tasks, fp, options.briefingHash, options.cooldownMs)
    ) {
      skippedCooldown++;
      continue;
    }
    if (!activeCoordinator) activeCoordinator = ht.coordinator;
    tasks.push({
      fingerprint: fp,
      agentId,
      reason: `[${ht.coordinator}] ${ht.reason}`,
      source: "recommended",
      coordinator: ht.coordinator,
    });
    if (tasks.length >= options.maxTasks) break;
  }

  return { tasks, skippedCooldown, heapPlan, activeCoordinator };
}

function numericsMaxPerTick(): number {
  const n = Number(process.env.LI_HEAP_MAX_NUMERICS_PER_TICK ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.min(3, Math.floor(n)) : 1;
}

/** Avoid back-to-back Cursor SDK sessions for researcher + bench_improver + autoresearch. */
export function limitNumericsTasksPerTick(
  flatTasks: HeapTask[],
  state: ControlPlaneState,
): HeapTask[] {
  const maxN = numericsMaxPerTick();
  const numerics = flatTasks.filter((t) => t.coordinator === "coord_numerics");
  if (numerics.length <= maxN) return flatTasks;

  const chosen: HeapTask[] = [];
  for (let i = 0; i < maxN; i++) {
    chosen.push(pickNumericsSlot(numerics, state, chosen));
  }

  const out: HeapTask[] = [];
  let numericsInserted = false;
  for (const t of flatTasks) {
    if (t.coordinator !== "coord_numerics") {
      out.push(t);
      continue;
    }
    if (!numericsInserted) {
      out.push(...chosen);
      numericsInserted = true;
    }
  }
  return out;
}

function pickNumericsSlot(
  numerics: HeapTask[],
  state: ControlPlaneState,
  already: HeapTask[],
): HeapTask {
  const used = new Set(already.map((t) => t.agent));
  const remaining = numerics.filter((t) => !used.has(t.agent));
  const pool = remaining.length ? remaining : numerics;

  const researcherFreshMs = Number(process.env.LI_NUMERICS_RESEARCH_DONE_MS ?? 6 * 60 * 60 * 1000);
  const cutoff = Date.now() - researcherFreshMs;
  const researcherDone = state.recent_tasks.some(
    (t) =>
      t.agentId === "numerics_researcher" &&
      t.status === "finished" &&
      new Date(t.finished_at).getTime() >= cutoff,
  );

  if (researcherDone) {
    return (
      pool.find((t) => t.agent === "bench_improver") ??
      pool.find((t) => t.agent === "autoresearch") ??
      pool[0]!
    );
  }
  return pool.find((t) => t.agent === "numerics_researcher") ?? pool[0]!;
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
