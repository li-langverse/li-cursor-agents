import { spawnSync } from "node:child_process";
import type { CmdResult } from "./types.js";

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
  return Boolean(resolveGhToken());
}

/** GH_TOKEN / GITHUB_TOKEN for push (bypasses global gh `url.insteadof` → cursor[bot]). */
export function resolveGhToken(): string | undefined {
  const t = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  return t || undefined;
}

/** Push branch; uses explicit token URL when set so Cloud global git config cannot force cursor[bot]. */
export function gitPushBranch(
  cloneDir: string,
  branch: string,
  org: string,
  repo: string,
  dryRun = false,
): CmdResult {
  const label = `git push ${org}/${repo} ${branch}`;
  if (dryRun) {
    return { ok: true, code: 0, stdout: `[dry-run] ${label}`, stderr: "" };
  }
  const token = resolveGhToken();
  if (token) {
    const url = `https://x-access-token:${token}@github.com/${org}/${repo}.git`;
    return runCmd("git", ["push", url, `${branch}:${branch}`], cloneDir, false);
  }
  return runCmd("git", ["push", "-u", "origin", branch], cloneDir, false);
}

/** Remove gh clone `url.*.insteadof` rules from the repo-local config. */
export function scrubCloneGitInsteadof(cloneDir: string, dryRun = false): void {
  if (dryRun) return;
  runCmd("git", ["config", "--local", "--remove-section", "url"], cloneDir, false);
}

export function defaultBranch(org: string, repo: string, dryRun: boolean): string {
  if (dryRun) return "main";
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
  const r = runCmd("git", ["status", "--porcelain"], cloneDir, false);
  return r.ok ? r.stdout : "";
}
