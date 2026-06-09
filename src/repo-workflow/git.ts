import { spawnSync } from "node:child_process";
import type { CmdResult } from "./types.js";
import {
  githubOrg,
  gitAuthToken,
  gitlabGroup,
  gitlabHost,
  hasGitAuthToken,
  vcsProvider,
} from "./vcs-config.js";

export function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  dryRun = false,
): CmdResult {
  const label = `${cmd} ${args.join(" ")}`.trim();
  if (dryRun) {
    return { ok: true, code: 0, stdout: `[dry-run] ${label}`, stderr: "" };
  }
  const proc = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  return {
    ok: proc.status === 0,
    code: proc.status ?? 1,
    stdout: (proc.stdout ?? "").trim(),
    stderr: (proc.stderr ?? "").trim(),
  };
}

export function hasGitToken(): boolean {
  return hasGitAuthToken();
}

function authenticatedCloneUrl(repo: string): string | null {
  const token = gitAuthToken();
  if (!token) return null;
  const scheme = process.env.LI_GIT_SCHEME?.trim() || "https";
  if (vcsProvider() === "github") {
    const host = process.env.LI_GIT_HOST_LEGACY?.trim() || "github.com";
    return `${scheme}://x-access-token:${token}@${host}/${githubOrg()}/${repo}.git`;
  }
  return `${scheme}://oauth2:${token}@${gitlabHost()}/${gitlabGroup()}/${repo}.git`;
}

/** Clone or fetch+reset a repo using GitLab-primary auth (mirrors k8s-git-auth.sh). */
export function gitCloneRepo(
  repo: string,
  dest: string,
  branch: string,
  cwd = "/",
): CmdResult {
  const url = authenticatedCloneUrl(repo);
  if (!url) {
    return { ok: false, code: 1, stdout: "", stderr: "GITLAB_TOKEN or GH_TOKEN required for clone" };
  }
  const clone = runCmd("git", ["clone", "--branch", branch, url, dest], cwd, false);
  if (clone.ok) return clone;
  runCmd("git", ["clone", url, dest], cwd, false);
  const checkout = runCmd("git", ["checkout", "-B", branch, `origin/${branch}`], dest, false);
  if (!checkout.ok) {
    runCmd("git", ["checkout", "-B", branch], dest, false);
  }
  return checkout;
}

export function defaultBranch(org: string, repo: string, dryRun: boolean): string {
  if (dryRun) return "main";
  if (vcsProvider() === "gitlab") {
    return process.env.LI_DEFAULT_BRANCH?.trim() || "main";
  }
  const r = runCmd(
    "gh",
    ["repo", "view", `${org}/${repo}`, "--json", "defaultBranchRef", "-q", ".defaultBranchRef.name"],
    process.cwd(),
    false,
  );
  return r.ok && r.stdout ? r.stdout : "main";
}

export function gitStatusPorcelain(cloneDir: string, dryRun: boolean): string {
  if (dryRun) return " M .cursor/agent-kit-version\n";
  const proc = spawnSync("git", ["status", "--porcelain"], {
    cwd: cloneDir,
    encoding: "utf8",
    env: process.env,
  });
  if (proc.status !== 0) return "";
  // Do not trim: leading space on line 1 is part of the XY status prefix.
  return (proc.stdout ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/, "");
}
