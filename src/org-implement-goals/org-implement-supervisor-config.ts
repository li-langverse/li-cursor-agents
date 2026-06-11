/** Config for org implement-goals supervisor (handoffs + implement-goals.yaml queue). */

import { parseMaxIdleCycles } from "../org/supervisor-idle.js";

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function orgImplementSupervisorNamespace(): string {
  return process.env.LI_ORG_IMPLEMENT_SUPERVISOR_NAMESPACE?.trim() || "li-swarm";
}

export function orgImplementSupervisorDeploymentName(): string {
  return process.env.LI_ORG_IMPLEMENT_SUPERVISOR_DEPLOYMENT?.trim() || "li-org-implement-goals-supervisor";
}

export function orgImplementSupervisorIntervalMs(): number {
  const n = Number(process.env.LI_ORG_IMPLEMENT_SUPERVISOR_INTERVAL_MS ?? 300_000);
  return Number.isFinite(n) && n >= 30_000 ? n : 300_000;
}

export function orgImplementSupervisorMaxIdleCycles(): number {
  return parseMaxIdleCycles(process.env.LI_ORG_IMPLEMENT_SUPERVISOR_MAX_IDLE_CYCLES, 0);
}

export function orgImplementSupervisorMaxWorkers(): number {
  const n = Number(process.env.LI_ORG_IMPLEMENT_SUPERVISOR_MAX_WORKERS ?? 2);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 6) : 2;
}

export function orgImplementSupervisorImage(): string {
  return (
    process.env.LI_ORG_IMPLEMENT_SUPERVISOR_IMAGE?.trim() ||
    "ghcr.io/li-langverse/li-cursor-agents:latest"
  );
}

export function orgImplementSupervisorNodeSelector(): Record<string, string> {
  const raw = process.env.LI_ORG_IMPLEMENT_SUPERVISOR_NODE_SELECTOR?.trim();
  if (raw) {
    const out: Record<string, string> = {};
    for (const part of raw.split(",")) {
      const [k, v] = part.split("=").map((s) => s.trim());
      if (k && v) out[k] = v;
    }
    if (Object.keys(out).length) return out;
  }
  return { "li-langverse.io/node-pool": "engine" };
}

export function computeDesiredWorkers(
  pendingCount: number,
  maxWorkers = orgImplementSupervisorMaxWorkers(),
): number {
  if (pendingCount <= 0) return 0;
  return Math.min(maxWorkers, Math.max(1, pendingCount));
}

export function orgImplementSupervisorEnabled(): boolean {
  return truthyEnv("LI_ORG_IMPLEMENT_SUPERVISOR_ENABLED");
}

export function implementRefForHandoff(handoffId: string): string {
  return `handoff:${handoffId}`;
}

export function implementRefForGoal(goalId: string, todoId: string): string {
  return `goal:${goalId}:${todoId}`;
}

export function parseImplementRef(
  ref: string,
):
  | { kind: "handoff"; handoffId: string }
  | { kind: "goal"; goalId: string; todoId: string }
  | null {
  const handoff = /^handoff:(.+)$/.exec(ref.trim());
  if (handoff) return { kind: "handoff", handoffId: handoff[1]! };
  const goal = /^goal:([^:]+):(.+)$/.exec(ref.trim());
  if (goal) return { kind: "goal", goalId: goal[1]!, todoId: goal[2]! };
  return null;
}

export function implementSlug(ref: string): string {
  return ref.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
}
