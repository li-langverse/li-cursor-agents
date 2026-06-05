/** Always-on worker: squash-merge green PRs from org-pr-merge-queue.json (no agent). */

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isOrgPrMergeWorkerAlwaysOn(): boolean {
  return truthyEnv("LI_ORG_PR_MERGE_WORKER_ALWAYS_ON");
}

export function orgPrMergeWorkerEnabled(): boolean {
  return isOrgPrMergeWorkerAlwaysOn() || truthyEnv("LI_ORG_PR_MERGE_WORKER_ENABLED");
}

export function orgPrMergeWorkerIntervalMs(): number {
  const n = Number(process.env.LI_ORG_PR_MERGE_WORKER_INTERVAL_MS ?? 600_000);
  return Number.isFinite(n) && n >= 60_000 ? n : 600_000;
}

export function orgPrMergeWorkerLimit(): number {
  const n = Number(process.env.LI_ORG_PR_MERGE_WORKER_LIMIT ?? 8);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 50) : 8;
}
