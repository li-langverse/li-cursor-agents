import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { defaultBranch, runCmd } from "./git.js";
import { maybePruneWorkspaces } from "./workspace-prune.js";
import type { PrepareWorkspaceResult, RepoWorkflowOptions } from "./types.js";

const GOVERNANCE_REPOS = new Set(["roadmap"]);

export function workspacesRoot(custom?: string): string {
  const root = custom ?? process.env.LI_WORKSPACE_ROOT ?? join(agentsPackageRoot(), "data", "workspaces");
  mkdirSync(root, { recursive: true });
  return root;
}

export function isGovernanceRepo(repo: string): boolean {
  return GOVERNANCE_REPOS.has(repo);
}

export function cloneDirFor(
  org: string,
  repo: string,
  runId: string,
  workspaceRoot?: string,
): string {
  return join(workspacesRoot(workspaceRoot), org, repo, runId, "repo");
}

/** Fresh isolated clone (or fetch+reset) for one org repo. */
export function prepareIsolatedClone(
  repo: string,
  options: RepoWorkflowOptions & { branchName: string },
): PrepareWorkspaceResult {
  const org = options.org ?? process.env.GH_ORG ?? "li-langverse";
  const runId = options.runId ?? String(Date.now());
  const dryRun = options.dryRun ?? false;
  const cloneDir = cloneDirFor(org, repo, runId, options.workspaceRoot);
  const baseBranch = defaultBranch(org, repo, dryRun);

  if (dryRun) {
    return { ok: true, cloneDir, baseBranch, branch: options.branchName };
  }

  mkdirSync(join(cloneDir, ".."), { recursive: true });

  if (process.env.LI_REPO_WORKFLOW_FRESH === "1" && existsSync(cloneDir)) {
    rmSync(cloneDir, { recursive: true, force: true });
  }

  if (!existsSync(join(cloneDir, ".git"))) {
    const clone = runCmd(
      "gh",
      ["repo", "clone", `${org}/${repo}`, cloneDir, "--", "--branch", baseBranch],
      process.cwd(),
      false,
    );
    if (!clone.ok) {
      return {
        ok: false,
        cloneDir,
        baseBranch,
        branch: options.branchName,
        error: clone.stderr || clone.stdout || "gh repo clone failed",
      };
    }
  } else {
    runCmd("git", ["fetch", "origin"], cloneDir, false);
    runCmd("git", ["checkout", baseBranch], cloneDir, false);
    const pull = runCmd("git", ["pull", "--ff-only", "origin", baseBranch], cloneDir, false);
    if (!pull.ok) {
      return {
        ok: false,
        cloneDir,
        baseBranch,
        branch: options.branchName,
        error: pull.stderr || "git pull failed",
      };
    }
  }

  runCmd("git", ["checkout", "-B", options.branchName], cloneDir, false);

  maybePruneWorkspaces({ workspaceRoot: options.workspaceRoot });

  return { ok: true, cloneDir, baseBranch, branch: options.branchName };
}
