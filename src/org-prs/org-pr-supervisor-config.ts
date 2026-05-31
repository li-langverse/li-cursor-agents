/** Config shared by org PR implementer + reviewer K8s supervisors. */

const ORG = "li-langverse";

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function orgPrSupervisorNamespace(): string {
  return process.env.LI_ORG_PR_SUPERVISOR_NAMESPACE?.trim() || "li-swarm";
}

export function orgPrSupervisorDeploymentName(): string {
  return process.env.LI_ORG_PR_SUPERVISOR_DEPLOYMENT?.trim() || "li-org-pr-supervisor";
}

export function orgReviewerSupervisorDeploymentName(): string {
  return process.env.LI_ORG_REVIEWER_SUPERVISOR_DEPLOYMENT?.trim() || "li-org-reviewer-supervisor";
}

export function orgPrSupervisorIntervalMs(): number {
  const n = Number(process.env.LI_ORG_PR_SUPERVISOR_INTERVAL_MS ?? 120_000);
  return Number.isFinite(n) && n >= 15_000 ? n : 120_000;
}

export function orgReviewerSupervisorIntervalMs(): number {
  const n = Number(process.env.LI_ORG_REVIEWER_SUPERVISOR_INTERVAL_MS ?? 120_000);
  return Number.isFinite(n) && n >= 15_000 ? n : 120_000;
}

export function orgPrSupervisorMaxIdleCycles(): number {
  const n = Number(process.env.LI_ORG_PR_SUPERVISOR_MAX_IDLE_CYCLES ?? 3);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}

export function orgReviewerSupervisorMaxIdleCycles(): number {
  const n = Number(process.env.LI_ORG_REVIEWER_SUPERVISOR_MAX_IDLE_CYCLES ?? 3);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}

export function orgPrSupervisorMaxWorkers(): number {
  const n = Number(process.env.LI_ORG_PR_SUPERVISOR_MAX_WORKERS ?? 3);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10) : 3;
}

export function orgReviewerSupervisorMaxWorkers(): number {
  const n = Number(process.env.LI_ORG_REVIEWER_SUPERVISOR_MAX_WORKERS ?? 3);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10) : 3;
}

export function orgPrSupervisorImage(): string {
  return (
    process.env.LI_ORG_PR_SUPERVISOR_IMAGE?.trim() ||
    "ghcr.io/li-langverse/li-cursor-agents:latest"
  );
}

export function orgPrSupervisorNodeSelector(): Record<string, string> {
  const raw = process.env.LI_ORG_PR_SUPERVISOR_NODE_SELECTOR?.trim();
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

export function computeDesiredWorkers(openCount: number, maxWorkers: number): number {
  if (openCount <= 0) return 0;
  return Math.min(maxWorkers, Math.max(1, Math.ceil(openCount / 50)));
}

export function orgName(): string {
  return ORG;
}

export function prRef(repo: string, number: number): string {
  return `${ORG}/${repo}#${number}`;
}

export function parsePrRef(ref: string): { org: string; repo: string; number: number } | null {
  const m = /^([^/]+)\/([^#]+)#(\d+)$/.exec(ref.trim());
  if (!m) return null;
  return { org: m[1], repo: m[2], number: Number(m[3]) };
}

export function prSlug(repo: string, number: number): string {
  return `${repo}-${number}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

export function orgPrSupervisorEnabled(): boolean {
  return truthyEnv("LI_ORG_PR_SUPERVISOR_ENABLED");
}

export function orgReviewerSupervisorEnabled(): boolean {
  return truthyEnv("LI_ORG_REVIEWER_SUPERVISOR_ENABLED");
}
