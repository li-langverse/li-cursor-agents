function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isProofExplorerWorkerAlwaysOn(): boolean {
  return truthyEnv("LI_PROOF_EXPLORER_ALWAYS_ON");
}

export function proofExplorerGoalFile(): string {
  const raw = process.env.LI_PROOF_EXPLORER_GOAL_FILE?.trim();
  if (raw) return raw;
  return "data/goal-directed-sprints/proof-explorer-program.md";
}

export function proofExplorerLicRoot(): string {
  const raw = process.env.LI_PROOF_EXPLORER_LIC_ROOT?.trim() || process.env.LIC_ROOT?.trim();
  if (raw) return raw;
  return "/li/lic";
}

export function proofExplorerAgentsRoot(): string {
  const raw = process.env.LI_CURSOR_AGENTS_ROOT?.trim();
  if (raw) return raw;
  return "/li/li-cursor-agents";
}

export function proofExplorerWorkflowRepo(): string {
  return process.env.LI_PROOF_EXPLORER_WORKFLOW_REPO?.trim() || "lic";
}

export function proofExplorerLoopSleepSec(): number {
  const n = Number(process.env.LI_PROOF_EXPLORER_LOOP_SLEEP_SEC ?? 120);
  return Number.isFinite(n) && n >= 30 ? n : 120;
}

export function proofExplorerLoopMax(): number {
  const n = Number(process.env.LI_PROOF_EXPLORER_LOOP_MAX ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
export function proofExplorerTrackedBranch(): string {
  const raw = process.env.LI_PROOF_EXPLORER_BRANCH?.trim();
  if (raw) return raw;
  return "cursor/proof-explorer-program";
}

export function proofExplorerRepoWorkflowEnv(): Record<string, string> {
  const branch = proofExplorerTrackedBranch();
  return {
    LI_REPO_WORKFLOW_BRANCH: branch,
    LI_REPO_WORKFLOW_TRACK_REMOTE: "1",
    LI_REPO_WORKFLOW_OPEN_PR: "0",
  };
}