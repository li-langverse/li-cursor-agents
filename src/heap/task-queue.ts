import { createHash } from "node:crypto";
import type { AgentId } from "../types.js";
import type { ControlPlaneState, QueuedAgentTask } from "../control-plane/types.js";
import { agentKitBumpActive } from "../preflight/agent-kit-sync.js";
import { buildHeapPlan, parseHeapPlanFromBriefing, type HeapPlan } from "./plan.js";
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

  const tasks: QueuedAgentTask[] = [];
  let skippedCooldown = 0;
  let activeCoordinator: CoordinatorId | undefined;

  const stopped = new Set(state.stopped_agents ?? []);
  const kitBump = agentKitBumpActive(briefing);

  for (const ht of heapPlan.flat_tasks) {
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

function extractRecommended(briefing: unknown): Array<{ agent: string; reason: string }> {
  if (!briefing || typeof briefing !== "object") return [];
  const rec = (briefing as Record<string, unknown>).recommended_agents;
  if (!Array.isArray(rec)) return [];
  return rec.filter(
    (r): r is { agent: string; reason: string } =>
      r && typeof r === "object" && typeof r.agent === "string" && typeof r.reason === "string",
  );
}
