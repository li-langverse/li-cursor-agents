/** Config for org-issue triage supervisor (needs_triage bucket). */

import { parseMaxIdleCycles } from "../org/supervisor-idle.js";

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function orgIssueTriageSupervisorNamespace(): string {
  return process.env.LI_ORG_ISSUE_TRIAGE_SUPERVISOR_NAMESPACE?.trim() || "li-swarm";
}

export function orgIssueTriageSupervisorDeploymentName(): string {
  return process.env.LI_ORG_ISSUE_TRIAGE_SUPERVISOR_DEPLOYMENT?.trim() || "li-org-issue-triage-supervisor";
}

export function orgIssueTriageSupervisorIntervalMs(): number {
  const n = Number(process.env.LI_ORG_ISSUE_TRIAGE_SUPERVISOR_INTERVAL_MS ?? 900_000);
  return Number.isFinite(n) && n >= 15_000 ? n : 900_000;
}

export function orgIssueTriageSupervisorMaxIdleCycles(): number {
  return parseMaxIdleCycles(process.env.LI_ORG_ISSUE_TRIAGE_SUPERVISOR_MAX_IDLE_CYCLES, 0);
}

export function orgIssueTriageSupervisorMaxWorkers(): number {
  const n = Number(process.env.LI_ORG_ISSUE_TRIAGE_SUPERVISOR_MAX_WORKERS ?? 3);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 6) : 3;
}

export function orgIssueTriageSupervisorImage(): string {
  return (
    process.env.LI_ORG_ISSUE_TRIAGE_SUPERVISOR_IMAGE?.trim() ||
    process.env.LI_ORG_ISSUE_SUPERVISOR_IMAGE?.trim() ||
    "ghcr.io/li-langverse/li-cursor-agents:latest"
  );
}

export function orgIssueTriageSupervisorNodeSelector(): Record<string, string> {
  const raw = process.env.LI_ORG_ISSUE_TRIAGE_SUPERVISOR_NODE_SELECTOR?.trim();
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

export function orgIssueTriageRefCooldownMs(): number {
  const n = Number(process.env.LI_ORG_ISSUE_TRIAGE_REF_COOLDOWN_MS ?? 3_600_000);
  return Number.isFinite(n) && n >= 60_000 ? Math.min(n, 86_400_000) : 3_600_000;
}

/** Desired concurrent triage Jobs from triage-bucket backlog. */
export function computeTriageDesiredWorkers(
  triageCount: number,
  maxWorkers = orgIssueTriageSupervisorMaxWorkers(),
): number {
  if (triageCount <= 0) return 0;
  return Math.min(maxWorkers, Math.max(1, Math.ceil(triageCount / 8)));
}

export function orgIssueTriageSupervisorEnabled(): boolean {
  return truthyEnv("LI_ORG_ISSUE_TRIAGE_SUPERVISOR_ENABLED");
}
