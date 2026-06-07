/** Config for the org-planner supervisor (K8s Deployment + wake CronJob). */

import { parseMaxIdleCycles } from "../org/supervisor-idle.js";

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function orgPlannerSupervisorNamespace(): string {
  return process.env.LI_ORG_PLANNER_SUPERVISOR_NAMESPACE?.trim() || "li-swarm";
}

export function orgPlannerSupervisorDeploymentName(): string {
  return process.env.LI_ORG_PLANNER_SUPERVISOR_DEPLOYMENT?.trim() || "li-org-planner-supervisor";
}

export function orgPlannerSupervisorIntervalMs(): number {
  const n = Number(process.env.LI_ORG_PLANNER_SUPERVISOR_INTERVAL_MS ?? 900_000);
  return Number.isFinite(n) && n >= 15_000 ? n : 120_000;
}

export function orgPlannerSupervisorMaxIdleCycles(): number {
  return parseMaxIdleCycles(process.env.LI_ORG_PLANNER_SUPERVISOR_MAX_IDLE_CYCLES, 3);
}

export function orgPlannerSupervisorMaxWorkers(): number {
  const n = Number(process.env.LI_ORG_PLANNER_MAX_WORKERS ?? 2);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10) : 2;
}

export function orgPlannerSupervisorImage(): string {
  return (
    process.env.LI_ORG_PLANNER_SUPERVISOR_IMAGE?.trim() ||
    "ghcr.io/li-langverse/li-cursor-agents:latest"
  );
}

export function orgPlannerSupervisorNodeSelector(): Record<string, string> {
  const raw = process.env.LI_ORG_PLANNER_SUPERVISOR_NODE_SELECTOR?.trim();
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

/** Desired concurrent planner Jobs from open planning backlog. */
export function computeDesiredWorkers(
  openCount: number,
  maxWorkers = orgPlannerSupervisorMaxWorkers(),
): number {
  if (openCount <= 0) return 0;
  return Math.min(maxWorkers, Math.max(1, Math.ceil(openCount / 12)));
}

export function orgPlannerSupervisorEnabled(): boolean {
  return truthyEnv("LI_ORG_PLANNER_SUPERVISOR_ENABLED");
}

export function orgPlannerIncludeNeedsTriage(): boolean {
  return truthyEnv("LI_ORG_PLANNER_INCLUDE_NEEDS_TRIAGE");
}

export function orgPlannerResearchEnabled(): boolean {
  const v = process.env.LI_ORG_PLANNER_RESEARCH_ENABLED?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

export function orgPlannerIssuesPerRun(): number {
  const n = Number(process.env.LI_ORG_PLANNER_ISSUES_PER_RUN ?? 3);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10) : 3;
}

export function orgPlannerAgentId(): string {
  return process.env.LI_ORG_PLANNER_AGENT?.trim() || "issue_planner";
}

export function researchPlanRef(goalId: string, sessionId: string): string {
  return `research-plan:${goalId}:${sessionId}`;
}

export function parseResearchPlanRef(ref: string): { goalId: string; sessionId: string } | null {
  const m = /^research-plan:([^:]+):(.+)$/.exec(ref.trim());
  if (!m) return null;
  return { goalId: m[1], sessionId: m[2] };
}

export function planSlug(kind: string, key: string): string {
  return `${kind}-${key}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
}
