/** Config for org swarm unblocker supervisor (infra self-heal). */

import { parseMaxIdleCycles } from "../org/supervisor-idle.js";

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function orgUnblockerNamespace(): string {
  return process.env.LI_ORG_UNBLOCKER_NAMESPACE?.trim() || "li-swarm";
}

export function orgUnblockerDeploymentName(): string {
  return process.env.LI_ORG_UNBLOCKER_DEPLOYMENT?.trim() || "li-org-unblocker-supervisor";
}

export function orgUnblockerIntervalMs(): number {
  const n = Number(process.env.LI_ORG_UNBLOCKER_INTERVAL_MS ?? 600_000);
  return Number.isFinite(n) && n >= 60_000 ? Math.min(n, 3_600_000) : 600_000;
}

export function orgUnblockerMaxIdleCycles(): number {
  return parseMaxIdleCycles(process.env.LI_ORG_UNBLOCKER_MAX_IDLE_CYCLES, 0);
}

export function orgUnblockerStuckJobMinutes(): number {
  const n = Number(process.env.LI_ORG_UNBLOCKER_STUCK_JOB_MINUTES ?? 20);
  return Number.isFinite(n) && n >= 5 ? Math.min(n, 180) : 20;
}

export function orgUnblockerEnabled(): boolean {
  return truthyEnv("LI_ORG_UNBLOCKER_ENABLED");
}

export const ORG_SUPERVISOR_DEPLOYMENTS = [
  "li-org-issue-supervisor",
  "li-org-issue-triage-supervisor",
  "li-org-planner-supervisor",
  "li-org-pr-supervisor",
  "li-org-reviewer-supervisor",
  "li-org-research-supervisor",
  "li-org-supervisor-dashboard",
  "li-org-unblocker-supervisor",
] as const;

export const ORG_WAKE_CRONJOBS = [
  "li-org-issue-supervisor-wake",
  "li-org-issue-triage-supervisor-wake",
  "li-org-planner-supervisor-wake",
  "li-org-pr-supervisor-wake",
  "li-org-reviewer-supervisor-wake",
  "li-org-research-supervisor-wake",
  "li-org-unblocker-supervisor-wake",
] as const;

export const STUCK_CONTAINER_REASONS = new Set([
  "CreateContainerConfigError",
  "ImagePullBackOff",
  "ErrImagePull",
  "InvalidImageName",
]);
