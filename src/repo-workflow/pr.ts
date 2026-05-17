import { hasGitToken, gitStatusPorcelain, runCmd } from "./git.js";
import type { CommitPushPrResult, RepoWorkflowOptions } from "./types.js";

export function commitPushOpenPr(
  cloneDir: string,
  options: {
    branch: string;
    baseBranch: string;
    org: string;
    repo: string;
    commitMessage: string;
    prTitle: string;
    prBody: string;
    dryRun?: boolean;
    skipPush?: boolean;
  },
): CommitPushPrResult {
  const dryRun = options.dryRun ?? false;
  const branch = options.branch;

  if (!hasGitToken() && !dryRun) {
    return {
      ok: false,
      skipped: true,
      skip_reason: "GH_TOKEN missing — cannot push or open PR",
      committed: false,
      pushed: false,
      branch,
      error: "set GH_TOKEN in .env.github",
    };
  }

  const dirty = gitStatusPorcelain(cloneDir, dryRun);
  if (!dirty.trim()) {
    return {
      ok: true,
      skipped: true,
      skip_reason: "no changes after install",
      committed: false,
      pushed: false,
      branch,
    };
  }

  const add = runCmd("git", ["add", "-A"], cloneDir, dryRun);
  if (!add.ok) {
    return {
      ok: false,
      committed: false,
      pushed: false,
      branch,
      error: add.stderr || "git add failed",
    };
  }

  const commit = runCmd("git", ["commit", "-m", options.commitMessage], cloneDir, dryRun);
  if (!commit.ok) {
    return {
      ok: false,
      committed: false,
      pushed: false,
      branch,
      error: commit.stderr || "git commit failed",
    };
  }

  if (options.skipPush) {
    return {
      ok: true,
      committed: true,
      pushed: false,
      branch,
      skip_reason: "LI_REPO_WORKFLOW_SKIP_PUSH=1",
    };
  }

  const push = runCmd("git", ["push", "-u", "origin", branch], cloneDir, dryRun);
  if (!push.ok) {
    return {
      ok: false,
      committed: true,
      pushed: false,
      branch,
      error: push.stderr || "git push failed",
    };
  }

  const pr = runCmd(
    "gh",
    [
      "pr",
      "create",
      "--repo",
      `${options.org}/${options.repo}`,
      "--base",
      options.baseBranch,
      "--head",
      branch,
      "--title",
      options.prTitle,
      "--body",
      options.prBody,
    ],
    cloneDir,
    dryRun,
  );

  if (!pr.ok) {
    return {
      ok: false,
      committed: true,
      pushed: true,
      branch,
      error: pr.stderr || "gh pr create failed",
    };
  }

  const url = pr.stdout.split("\n").find((l) => l.includes("github.com")) ?? pr.stdout;

  return {
    ok: true,
    committed: true,
    pushed: true,
    branch,
    pr_url: url.trim(),
  };
}

export function applyRepoWorkflowEnv(options: RepoWorkflowOptions): void {
  if (options.dryRun) process.env.LI_REPO_WORKFLOW_DRY_RUN = "1";
  if (options.skipPush) process.env.LI_REPO_WORKFLOW_SKIP_PUSH = "1";
}
