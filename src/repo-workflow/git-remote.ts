import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  gitAuthToken,
  githubMirrorUrl,
  githubOrg,
  primaryCloneUrl,
  vcsProvider,
} from "./vcs-config.js";
import { runCmd } from "./git.js";

function authPrefix(): string {
  return vcsProvider() === "gitlab" ? "oauth2" : "x-access-token";
}

/** Global git URL rewrite so bare host URLs authenticate (background runners + workspaces). */
export function configureGitAuthRewrites(): void {
  const token = gitAuthToken();
  if (!token) return;

  if (vcsProvider() === "gitlab") {
    const host = process.env.LI_GITLAB_HOST?.trim() || process.env.LI_GIT_HOST?.trim() || "gitlab.lilangverse.xyz";
    runCmd(
      "git",
      ["config", "--global", `url.https://${authPrefix()}:${token}@${host}/.insteadOf`, `https://${host}/`],
      process.cwd(),
      false,
    );
  } else {
    runCmd(
      "git",
      ["config", "--global", `url.https://x-access-token:${token}@github.com/.insteadOf`, "https://github.com/"],
      process.cwd(),
      false,
    );
  }

  const gh = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  if (gh && vcsProvider() === "gitlab") {
    runCmd(
      "git",
      ["config", "--global", `url.https://x-access-token:${gh}@github.com/.insteadOf`, "https://github.com/"],
      process.cwd(),
      false,
    );
  }
}

/** origin → GitLab (or GitHub legacy); github → fetch-only mirror when GitLab-primary. */
export function configureCloneRemotes(cloneDir: string, repo: string, org: string): void {
  const originUrl = primaryCloneUrl(org, repo);
  const hasOrigin = runCmd("git", ["remote", "get-url", "origin"], cloneDir, false).ok;
  if (hasOrigin) {
    runCmd("git", ["remote", "set-url", "origin", originUrl], cloneDir, false);
  } else {
    runCmd("git", ["remote", "add", "origin", originUrl], cloneDir, false);
  }

  if (vcsProvider() !== "gitlab") return;

  const mirror = githubMirrorUrl(repo);
  const hasGithub = runCmd("git", ["remote", "get-url", "github"], cloneDir, false).ok;
  if (hasGithub) {
    runCmd("git", ["remote", "set-url", "github", mirror], cloneDir, false);
  } else {
    runCmd("git", ["remote", "add", "github", mirror], cloneDir, false);
  }
  runCmd("git", ["remote", "set-url", "--push", "github", "DISABLED"], cloneDir, false);
}

export function migrateGithubOriginToGitlab(cloneDir: string, repo: string): boolean {
  const origin = runCmd("git", ["remote", "get-url", "origin"], cloneDir, false);
  if (!origin.ok || !origin.stdout.includes("github.com")) return false;
  const ghUrl = origin.stdout.trim();
  if (!runCmd("git", ["remote", "get-url", "github"], cloneDir, false).ok) {
    runCmd("git", ["remote", "add", "github", ghUrl], cloneDir, false);
    runCmd("git", ["remote", "set-url", "--push", "github", "DISABLED"], cloneDir, false);
  }
  configureCloneRemotes(cloneDir, repo, githubOrg());
  return true;
}

export function cloneOrSyncRepo(options: {
  org: string;
  repo: string;
  cloneDir: string;
  baseBranch: string;
}): { ok: boolean; error?: string } {
  configureGitAuthRewrites();
  const { org, repo, cloneDir, baseBranch } = options;
  const url = primaryCloneUrl(org, repo);

  if (!existsSync(join(cloneDir, ".git"))) {
    const proc = spawnSync("git", ["clone", "--branch", baseBranch, url, cloneDir], {
      encoding: "utf8",
      env: process.env,
    });
    if (proc.status !== 0) {
      const retry = spawnSync("git", ["clone", url, cloneDir], { encoding: "utf8", env: process.env });
      if (retry.status !== 0) {
        return { ok: false, error: (retry.stderr || proc.stderr || "git clone failed").trim() };
      }
      runCmd("git", ["checkout", "-B", baseBranch, `origin/${baseBranch}`], cloneDir, false);
    }
    configureCloneRemotes(cloneDir, repo, org);
    return { ok: true };
  }

  migrateGithubOriginToGitlab(cloneDir, repo);
  configureCloneRemotes(cloneDir, repo, org);
  runCmd("git", ["fetch", "origin", "--prune"], cloneDir, false);
  runCmd("git", ["checkout", baseBranch], cloneDir, false);
  const pull = runCmd("git", ["pull", "--ff-only", "origin", baseBranch], cloneDir, false);
  if (!pull.ok) {
    return { ok: false, error: pull.stderr || "git pull failed" };
  }
  return { ok: true };
}
