import { ORG_PR_SPRINT_ROLES_DEFERRING_CI_WORKER } from "../org-prs/swarm-ci-worker-config.js";

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isOrgIssueWorkerAlwaysOn(): boolean {
  return truthyEnv("LI_ORG_ISSUE_WORKER_ALWAYS_ON");
}

/** Defer when PR dirty/ci sprints own the shared GH token budget. */
export function orgIssueWorkerDeferredBySprintRole(): string | null {
  const role = process.env.ORG_PR_SPRINT_ROLE?.trim().toLowerCase();
  if (!role) return null;
  if (ORG_PR_SPRINT_ROLES_DEFERRING_CI_WORKER.has(role)) return role;
  return null;
}

export function orgIssueWorkerEnabled(): boolean {
  return isOrgIssueWorkerAlwaysOn() && orgIssueWorkerDeferredBySprintRole() === null;
}

export function orgIssueWorkerIntervalMs(): number {
  const n = Number(process.env.LI_ORG_ISSUE_WORKER_INTERVAL_MS ?? 1_800_000);
  return Number.isFinite(n) && n >= 60_000 ? n : 1_800_000;
}

export function orgIssueWorkerCloseLimit(): number {
  const n = Number(process.env.LI_ORG_ISSUE_WORKER_CLOSE_LIMIT ?? 10);
  return Number.isFinite(n) && n >= 0 ? n : 10;
}
