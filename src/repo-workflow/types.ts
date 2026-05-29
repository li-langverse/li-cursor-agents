export interface CmdResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export interface PrepareWorkspaceResult {
  ok: boolean;
  cloneDir: string;
  baseBranch: string;
  branch: string;
  error?: string;
}

export interface CommitPushPrResult {
  ok: boolean;
  skipped?: boolean;
  skip_reason?: string;
  committed: boolean;
  pushed: boolean;
  pr_url?: string;
  pr_number?: number;
  commit_sha?: string;
  branch: string;
  error?: string;
  swarm_attribution?: import("../swarm/swarm-attribution.js").SwarmGitArtifact;
}

export interface RepoWorkflowOptions {
  org?: string;
  workspaceRoot?: string;
  dryRun?: boolean;
  skipPush?: boolean;
  runId?: string;
}

export interface AgentKitRolloutRow {
  repo: string;
  workspace?: string;
  install_ok: boolean;
  workflow_ok: boolean;
  pr_url?: string;
  skipped?: boolean;
  skip_reason?: string;
  error?: string;
  governance?: boolean;
}
