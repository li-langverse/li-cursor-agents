import { SWARM_LABEL } from "../swarm/swarm-attribution.js";
/** Goal-directed sprints that own baseline (old) PRs — CI worker must not touch those rows. */
export const ORG_PR_SPRINT_ROLES_DEFERRING_CI_WORKER = new Set(["old-dirty", "old-ci"]);
export const DEFAULT_SWARM_CI_WORKER_LABELS = [
    SWARM_LABEL,
    "agent:ci_maintainer",
    "agent:workspace_sweeper",
    "agent:agent_kit_maintainer",
    "agent:docs_maintainer",
    "agent:code_implementer",
] as const;
function truthyEnv(name: string): boolean {
    const v = process.env[name]?.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
}
export function isSwarmCiWorkerAlwaysOn(): boolean {
    return truthyEnv("LI_SWARM_CI_WORKER_ALWAYS_ON");
}
/** When set on this process, defer to the dirty/ci goal-directed sprint coordinator. */
export function swarmCiWorkerDeferredBySprintRole(): string | null {
    const role = process.env.ORG_PR_SPRINT_ROLE?.trim().toLowerCase();
    if (!role)
        return null;
    if (ORG_PR_SPRINT_ROLES_DEFERRING_CI_WORKER.has(role)) {
        return role;
    }
    return null;
}
export function swarmCiWorkerEnabled(): boolean {
    return isSwarmCiWorkerAlwaysOn() && swarmCiWorkerDeferredBySprintRole() === null;
}
export function swarmCiWorkerIntervalMs(): number {
    const n = Number(process.env.LI_SWARM_CI_WORKER_INTERVAL_MS ?? 300_000);
    return Number.isFinite(n) && n >= 60_000 ? Math.min(3_600_000, Math.floor(n)) : 300_000;
}
export function swarmCiWorkerMergeLimit(): number {
    const n = Number(process.env.LI_SWARM_CI_WORKER_MERGE_LIMIT ?? 8);
    return Number.isFinite(n) && n >= 0 ? Math.min(50, Math.floor(n)) : 8;
}
export function swarmCiWorkerRequireLabels(): boolean {
    const v = process.env.LI_SWARM_CI_WORKER_REQUIRE_LABELS?.trim().toLowerCase();
    if (v === "0" || v === "false" || v === "off" || v === "no")
        return false;
    return true;
}
export function swarmCiWorkerLabelFilter(): string[] {
    const raw = process.env.LI_SWARM_CI_WORKER_LABELS?.trim();
    if (!raw)
        return [...DEFAULT_SWARM_CI_WORKER_LABELS];
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}
export function swarmCiWorkerSubset(): "new" {
    return "new";
}