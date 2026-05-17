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
  return Boolean(process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim());
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
