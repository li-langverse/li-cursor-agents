/** Governance & Assurance (G&A) org swarm — per-repo × per-lane auditors. */

import { parseMaxIdleCycles } from "../org/supervisor-idle.js";

export const GA_LANE_DEFS = [
  { id: "unit", agentId: "ga_unit_auditor", label: "Unit tests" },
  { id: "integration", agentId: "ga_integration_auditor", label: "Integration tests" },
  { id: "e2e", agentId: "ga_e2e_auditor", label: "E2E tests" },
  { id: "gui-visual", agentId: "ga_gui_auditor", label: "GUI / visual QA" },
  { id: "soc", agentId: "ga_soc_auditor", label: "SOC / security compliance" },
  { id: "documentation", agentId: "ga_docs_auditor", label: "Documentation" },
] as const;

export type GaLaneId = (typeof GA_LANE_DEFS)[number]["id"];

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function orgGaSupervisorEnabled(): boolean {
  return truthyEnv("LI_ORG_GA_SUPERVISOR_ENABLED");
}

export function orgGaSupervisorNamespace(): string {
  return process.env.LI_ORG_GA_SUPERVISOR_NAMESPACE?.trim() || "li-swarm";
}

export function orgGaSupervisorDeploymentName(): string {
  return process.env.LI_ORG_GA_SUPERVISOR_DEPLOYMENT?.trim() || "li-org-ga-supervisor";
}

export function orgGaSupervisorIntervalMs(): number {
  const n = Number(process.env.LI_ORG_GA_SUPERVISOR_INTERVAL_MS ?? 900_000);
  return Number.isFinite(n) && n >= 60_000 ? n : 900_000;
}

export function orgGaSupervisorMaxIdleCycles(): number {
  return parseMaxIdleCycles(process.env.LI_ORG_GA_SUPERVISOR_MAX_IDLE_CYCLES, 3);
}

export function orgGaSupervisorMaxWorkers(): number {
  const n = Number(process.env.LI_ORG_GA_SUPERVISOR_MAX_WORKERS ?? 6);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 12) : 6;
}

export function orgGaSupervisorImage(): string {
  return (
    process.env.LI_ORG_GA_SUPERVISOR_IMAGE?.trim() ||
    "ghcr.io/li-langverse/li-cursor-agents:latest"
  );
}

/** Supervisor pod — stays on engine pool (shared sprint-data PVC). */
export function orgGaSupervisorNodeSelector(): Record<string, string> {
  const raw = process.env.LI_ORG_GA_SUPERVISOR_NODE_SELECTOR?.trim();
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

/** Auditor Job hostnames (comma-separated). Default: desktop + engine (amd64). */
export function orgGaAuditorNodeNames(): string[] {
  const raw = process.env.LI_ORG_GA_AUDITOR_NODES?.trim() ?? "desktop,engine";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function orgGaAuditorArch(): string {
  return process.env.LI_ORG_GA_AUDITOR_ARCH?.trim() || "amd64";
}

export function defaultGaLanes(): GaLaneId[] {
  const raw = process.env.LI_ORG_GA_LANES?.trim();
  if (raw) {
    const allowed = new Set(GA_LANE_DEFS.map((l) => l.id));
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean) as GaLaneId[];
    const picked = parts.filter((p) => allowed.has(p));
    if (picked.length) return picked;
  }
  return GA_LANE_DEFS.map((l) => l.id);
}

export function gaLaneAgentId(lane: GaLaneId): string {
  return GA_LANE_DEFS.find((l) => l.id === lane)?.agentId ?? "ga_unit_auditor";
}

export function gaRef(repo: string, lane: GaLaneId): string {
  return `${repo}@${lane}`;
}

export function parseGaRef(ref: string): { repo: string; lane: GaLaneId } | null {
  const m = /^([^@]+)@(.+)$/.exec(ref.trim());
  if (!m) return null;
  const lane = m[2] as GaLaneId;
  if (!GA_LANE_DEFS.some((l) => l.id === lane)) return null;
  return { repo: m[1], lane };
}

export function gaSlug(repo: string, lane: string): string {
  return `${repo}-${lane}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

export function computeDesiredGaWorkers(
  pendingCount: number,
  maxWorkers = orgGaSupervisorMaxWorkers(),
): number {
  if (pendingCount <= 0) return 0;
  return Math.min(maxWorkers, Math.max(1, Math.ceil(pendingCount / 4)));
}

/** Max age for claimed/running rows with no live K8s Job before auto-fail (default 2h). */
export function orgGaStaleClaimMaxAgeMs(): number {
  const n = Number(process.env.LI_ORG_GA_STALE_CLAIM_MS ?? 7_200_000);
  return Number.isFinite(n) && n >= 60_000 ? n : 7_200_000;
}

/** Claim without jobName is abandoned after this grace (default 5m). */
export function orgGaOrphanClaimGraceMs(): number {
  const n = Number(process.env.LI_ORG_GA_ORPHAN_CLAIM_MS ?? 300_000);
  return Number.isFinite(n) && n >= 30_000 ? n : 300_000;
}
