/** Config for the org-research supervisor (K8s Deployment + wake CronJob). */

const DEFAULT_DIMENSIONS = ["security", "performance", "ux", "api-coverage"] as const;

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function orgResearchSupervisorNamespace(): string {
  return process.env.LI_ORG_RESEARCH_SUPERVISOR_NAMESPACE?.trim() || "li-swarm";
}

export function orgResearchSupervisorDeploymentName(): string {
  return process.env.LI_ORG_RESEARCH_SUPERVISOR_DEPLOYMENT?.trim() || "li-org-research-supervisor";
}

export function orgResearchSupervisorIntervalMs(): number {
  const n = Number(process.env.LI_ORG_RESEARCH_SUPERVISOR_INTERVAL_MS ?? 3_600_000);
  return Number.isFinite(n) && n >= 15_000 ? n : 120_000;
}

export function orgResearchSupervisorMaxIdleCycles(): number {
  const n = Number(process.env.LI_ORG_RESEARCH_SUPERVISOR_MAX_IDLE_CYCLES ?? 3);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}

export function orgResearchSupervisorMaxWorkers(): number {
  const n = Number(process.env.LI_ORG_RESEARCH_SUPERVISOR_MAX_WORKERS ?? 3);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10) : 3;
}

export function orgResearchSupervisorImage(): string {
  return (
    process.env.LI_ORG_RESEARCH_SUPERVISOR_IMAGE?.trim() ||
    "ghcr.io/li-langverse/li-cursor-agents:latest"
  );
}

export function orgResearchSupervisorNodeSelector(): Record<string, string> {
  const raw = process.env.LI_ORG_RESEARCH_SUPERVISOR_NODE_SELECTOR?.trim();
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

/** Desired concurrent researcher Jobs from open research backlog. */
export function computeDesiredWorkers(
  openCount: number,
  maxWorkers = orgResearchSupervisorMaxWorkers(),
): number {
  if (openCount <= 0) return 0;
  return Math.min(maxWorkers, Math.max(1, Math.ceil(openCount / 50)));
}

export function orgResearchSupervisorEnabled(): boolean {
  return truthyEnv("LI_ORG_RESEARCH_SUPERVISOR_ENABLED");
}

export function researchRef(goalId: string, dimension: string): string {
  return `${goalId}@${dimension}`;
}

export function parseResearchRef(ref: string): { goalId: string; dimension: string } | null {
  const m = /^([^@]+)@(.+)$/.exec(ref.trim());
  if (!m) return null;
  return { goalId: m[1], dimension: m[2] };
}

export function researchSlug(goalId: string, dimension: string): string {
  return `${goalId}-${dimension}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/** Dimensions from env (comma-separated) or defaults. */
export function defaultResearchDimensions(): string[] {
  const raw = process.env.LI_ORG_RESEARCH_DIMENSIONS?.trim();
  if (raw) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts;
  }
  return [...DEFAULT_DIMENSIONS];
}

export function orgResearchResearcherAgentId(): string {
  const raw = process.env.LI_ORG_RESEARCH_RESEARCHER_AGENT?.trim();
  if (raw) return raw;
  return "goal_researcher";
}
