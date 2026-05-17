import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { agentsPackageRoot } from "../runner.js";
import type { AgentDefinition, AgentId } from "../types.js";
import { defaultBranch, gitStatusPorcelain, runCmd } from "./git.js";
import { prepareIsolatedClone } from "./workspace.js";
import type { PrepareWorkspaceResult, RepoWorkflowOptions } from "./types.js";

export interface RepoWorkflowSession extends PrepareWorkspaceResult {
  org: string;
  repo: string;
  runId: string;
  dryRun: boolean;
  skipPush: boolean;
}

const DEFAULT_REPO_BY_AGENT: Partial<Record<AgentId, string>> = {
  docs_maintainer: "li-demo",
  ci_maintainer: "li-demo",
  code_implementer: "li-demo",
  bug_fixer: "li-demo",
  security_auditor: "lic",
  bench_improver: "lic",
  numerics_researcher: "lic",
  autoresearch: "lic",
};

export function resolveWorkflowRepo(agentId: string, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  const fromEnv = process.env.LI_REPO_WORKFLOW_REPO?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_REPO_BY_AGENT[agentId as AgentId] ?? "li-demo";
}

export function agentUsesGuaranteedPush(definition: AgentDefinition): boolean {
  return Boolean(definition.repoWorkflow || definition.guaranteedPush);
}

function fixtureDemoRoot(): string {
  return join(agentsPackageRoot(), "fixtures", "li-demo-workflow");
}

/** Local git repo for tests — no `gh clone`. */
function prepareFixtureDemoClone(
  branchName: string,
  workspaceRoot: string,
  runId: string,
): PrepareWorkspaceResult {
  const org = process.env.GH_ORG ?? "li-langverse";
  const cloneDir = join(workspaceRoot, org, "li-demo", runId, "repo");
  mkdirSync(cloneDir, { recursive: true });
  const src = fixtureDemoRoot();
  if (existsSync(src)) {
    cpSync(src, cloneDir, { recursive: true, force: true });
  }

  if (!existsSync(join(cloneDir, ".git"))) {
    runCmd("git", ["init"], cloneDir, false);
    runCmd("git", ["config", "user.email", "agent@li-langverse.test"], cloneDir, false);
    runCmd("git", ["config", "user.name", "li-cursor-agents"], cloneDir, false);
    runCmd("git", ["add", "-A"], cloneDir, false);
    runCmd("git", ["commit", "-m", "fixture: initial li-demo workflow test repo"], cloneDir, false);
  }

  runCmd("git", ["checkout", "-B", branchName], cloneDir, false);
  return { ok: true, cloneDir, baseBranch: "main", branch: branchName };
}

export function beginRepoWorkflowSession(input: {
  agentId: string;
  repo?: string;
  branchName?: string;
  dryRun?: boolean;
  skipPush?: boolean;
  workspaceRoot?: string;
  runId?: string;
  useFixture?: boolean;
}): RepoWorkflowSession {
  const org = process.env.GH_ORG ?? "li-langverse";
  const repo = resolveWorkflowRepo(input.agentId, input.repo);
  const runId = input.runId ?? `${input.agentId}-${Date.now()}`;
  const branchName =
    input.branchName ??
    process.env.LI_REPO_WORKFLOW_BRANCH?.trim() ??
    `chore/agent-${input.agentId}-${runId.slice(-8)}`;
  const dryRun = input.dryRun ?? false;
  const skipPush = input.skipPush ?? false;
  const useFixture =
    input.useFixture ??
    (process.env.LI_REPO_WORKFLOW_USE_FIXTURE === "1" ||
      process.env.LI_REPO_WORKFLOW_USE_FIXTURE === "true");

  let prep: PrepareWorkspaceResult;
  if (useFixture && repo === "li-demo") {
    const root =
      input.workspaceRoot ?? join(agentsPackageRoot(), "data", "workspaces-test");
    mkdirSync(root, { recursive: true });
    prep = prepareFixtureDemoClone(branchName, root, runId);
  } else {
    prep = prepareIsolatedClone(repo, {
      org,
      branchName,
      dryRun,
      workspaceRoot: input.workspaceRoot,
      runId,
    });
  }

  if (prep.ok) {
    process.env.LI_REPO_WORKFLOW_WORKSPACE = prep.cloneDir;
    process.env.LI_REPO_WORKFLOW_REPO = repo;
    process.env.LI_REPO_WORKFLOW_BRANCH = prep.branch;
    process.env.LI_REPO_WORKFLOW_BASE = prep.baseBranch;
    process.env.LI_REPO_WORKFLOW_ORG = org;
  }

  return {
    ...prep,
    org,
    repo,
    runId,
    dryRun,
    skipPush,
  };
}

export function readWorkspaceSessionFromEnv(): RepoWorkflowSession | null {
  const cloneDir = process.env.LI_REPO_WORKFLOW_WORKSPACE?.trim();
  const repo = process.env.LI_REPO_WORKFLOW_REPO?.trim();
  if (!cloneDir || !repo) return null;
  return {
    ok: existsSync(cloneDir),
    cloneDir,
    baseBranch: process.env.LI_REPO_WORKFLOW_BASE?.trim() || "main",
    branch: process.env.LI_REPO_WORKFLOW_BRANCH?.trim() || "main",
    org: process.env.LI_REPO_WORKFLOW_ORG?.trim() || "li-langverse",
    repo,
    runId: "env",
    dryRun: process.env.LI_REPO_WORKFLOW_DRY_RUN === "1",
    skipPush: process.env.LI_REPO_WORKFLOW_SKIP_PUSH === "1",
  };
}

export function workspaceHasChanges(session: RepoWorkflowSession): boolean {
  return Boolean(gitStatusPorcelain(session.cloneDir, session.dryRun).trim());
}

export function defaultPrBody(agentId: string, reason?: string): string {
  return [
    "<!-- li-agent -->",
    "## Agent deliverable",
    `- [x] Branch pushed by li-cursor-agents post-hook (\`${agentId}\`)`,
    "- [x] CI triggered on PR",
    reason ? `- **Task:** ${reason}` : "",
    "- [ ] merge-approved (human after review)",
    "",
    "_Automated commit/push after agent run — review diff before merge._",
  ]
    .filter(Boolean)
    .join("\n");
}
