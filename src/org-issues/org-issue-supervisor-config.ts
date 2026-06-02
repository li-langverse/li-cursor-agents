/** Config for the org-issue supervisor (K8s Deployment + wake CronJob). */

const ORG = "li-langverse";

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function orgIssueSupervisorNamespace(): string {
  return process.env.LI_ORG_ISSUE_SUPERVISOR_NAMESPACE?.trim() || "li-swarm";
}

export function orgIssueSupervisorDeploymentName(): string {
  return process.env.LI_ORG_ISSUE_SUPERVISOR_DEPLOYMENT?.trim() || "li-org-issue-supervisor";
}

export function orgIssueSupervisorIntervalMs(): number {
  const n = Number(process.env.LI_ORG_ISSUE_SUPERVISOR_INTERVAL_MS ?? 120_000);
  return Number.isFinite(n) && n >= 15_000 ? n : 120_000;
}

export function orgIssueSupervisorMaxIdleCycles(): number {
  const n = Number(process.env.LI_ORG_ISSUE_SUPERVISOR_MAX_IDLE_CYCLES ?? 3);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}

export function orgIssueSupervisorMaxWorkers(): number {
  const n = Number(process.env.LI_ORG_ISSUE_SUPERVISOR_MAX_WORKERS ?? 3);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10) : 3;
}

export function orgIssueSupervisorImage(): string {
  return (
    process.env.LI_ORG_ISSUE_SUPERVISOR_IMAGE?.trim() ||
    "ghcr.io/li-langverse/li-cursor-agents:latest"
  );
}

export function orgIssueSupervisorNodeSelector(): Record<string, string> {
  const raw = process.env.LI_ORG_ISSUE_SUPERVISOR_NODE_SELECTOR?.trim();
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

/** Desired concurrent implementer Jobs from implement-bucket backlog. */
export function computeDesiredWorkers(implementCount: number, maxWorkers = orgIssueSupervisorMaxWorkers()): number {
  if (implementCount <= 0) return 0;
  return Math.min(maxWorkers, Math.max(1, Math.ceil(implementCount / 10)));
}

export function orgName(): string {
  return ORG;
}

export function issueRef(repo: string, number: number): string {
  return `${ORG}/${repo}#${number}`;
}

export function parseIssueRef(ref: string): { org: string; repo: string; number: number } | null {
  const m = /^([^/]+)\/([^#]+)#(\d+)$/.exec(ref.trim());
  if (!m) return null;
  return { org: m[1], repo: m[2], number: Number(m[3]) };
}

export function issueSlug(repo: string, number: number): string {
  return `${repo}-${number}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

export function orgIssueSupervisorEnabled(): boolean {
  return truthyEnv("LI_ORG_ISSUE_SUPERVISOR_ENABLED") || truthyEnv("LI_ORG_ISSUE_WORKER_ALWAYS_ON");
}
