import { classifyGitRemoteError } from "./git-errors.js";
import { findOpenPrForBranch, gitPushBranch, hasGitToken, gitStatusPorcelain, runCmd } from "./git.js";
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
    /** When true, assume `git add` already ran (e.g. workspace sweeper safe paths). */
    skipGitAdd?: boolean;
  },
): CommitPushPrResult {
  const dryRun = options.dryRun ?? false;
  const branch = options.branch;

  const needsRemote = !dryRun && !options.skipPush;
  if (!hasGitToken() && needsRemote) {
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

  if (!options.skipGitAdd) {
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

  const push = gitPushBranch(cloneDir, branch, options.org, options.repo, dryRun);
  if (!push.ok) {
    const c = classifyGitRemoteError(push.stderr, push.stdout);
    return {
      ok: false,
      committed: true,
      pushed: false,
      branch,
      error: `[${c.code}] ${c.message} — ${c.hint}`,
    };
  }

  const afterPushPr = findOpenPrForBranch(options.org, options.repo, branch, dryRun);
  if (afterPushPr) {
    return {
      ok: true,
      committed: true,
      pushed: true,
      branch,
      pr_url: afterPushPr,
      skip_reason: "reused_existing_open_pr",
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
    const c = classifyGitRemoteError(pr.stderr, pr.stdout);
    const reused = findOpenPrForBranch(options.org, options.repo, branch, dryRun);
    if (reused || c.code === "pr_already_exists") {
      return {
        ok: true,
        committed: true,
        pushed: true,
        branch,
        pr_url: reused,
        skip_reason: "reused_existing_open_pr",
      };
    }
    return {
      ok: false,
      committed: true,
      pushed: true,
      branch,
      error: `[${c.code}] ${c.message} — ${c.hint}`,
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
