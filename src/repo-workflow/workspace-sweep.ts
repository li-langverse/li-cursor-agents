import { join } from "node:path";
import type { CommitPushPrResult } from "./types.js";
import {
  discoverDirtyRepos,
  resolveSweepRoots,
  safeChangedPaths,
  type DirtyRepoDiscovery,
} from "./discover-dirty-repos.js";
import { runCmd, defaultBranch } from "./git.js";
import { commitPushOpenPr } from "./pr.js";
import { restartControlPlaneStack } from "./restart-stack.js";

export interface RepoSweepResult {
  discovery: DirtyRepoDiscovery;
  tests_ran: string[];
  test_ok: boolean | null;
  push: CommitPushPrResult & { workspace: string; repo: string };
}

export interface WorkspaceSweepReport {
  generated_at: string;
  repos_scanned: number;
  dirty_found: number;
  sweeps: RepoSweepResult[];
  restart?: { ok: boolean; message: string; skipped?: boolean };
}

export interface WorkspaceSweepOptions {
  benchmarksRoot?: string;
  roots?: string[];
  maxRepos?: number;
  dryRun?: boolean;
  skipPush?: boolean;
  runTests?: boolean;
  restart?: boolean;
  agentId?: string;
}

function safeGitAdd(repoPath: string, porcelain: string, dryRun: boolean): { ok: boolean; error?: string } {
  const paths = safeChangedPaths(porcelain);
  if (paths.length === 0) {
    return { ok: false, error: "only secret/ignored paths changed — not staging" };
  }
  const add = runCmd("git", ["add", "--", ...paths], repoPath, dryRun);
  if (!add.ok) return { ok: false, error: add.stderr || "git add failed" };
  return { ok: true };
}

function ensureFeatureBranch(
  repo: DirtyRepoDiscovery,
  dryRun: boolean,
): { branch: string; created: boolean } {
  const protectedNames = new Set(["main", "master", "dev"]);
  let branch = repo.branch;
  if (!branch || branch === "HEAD" || protectedNames.has(branch)) {
    branch = `chore/workspace-sweep-${Date.now().toString(36)}`;
    runCmd("git", ["checkout", "-B", branch], repo.path, dryRun);
    return { branch, created: true };
  }
  return { branch, created: false };
}

function runTestCommands(repo: DirtyRepoDiscovery, dryRun: boolean): { ran: string[]; ok: boolean | null } {
  if (!repo.test_commands.length) return { ran: [], ok: null };
  const ran: string[] = [];
  for (const cmd of repo.test_commands.slice(0, 2)) {
    ran.push(cmd);
    if (dryRun) continue;
    const proc = runCmd("bash", ["-lc", cmd], repo.path, false);
    if (!proc.ok) return { ran, ok: false };
  }
  return { ran, ok: dryRun ? null : true };
}

function sweepOneRepo(
  discovery: DirtyRepoDiscovery,
  options: WorkspaceSweepOptions,
): RepoSweepResult {
  const dryRun = options.dryRun ?? false;
  const skipPush = options.skipPush ?? process.env.LI_REPO_WORKFLOW_SKIP_PUSH === "1";
  const agentId = options.agentId ?? "workspace_sweeper";

  const { branch } = ensureFeatureBranch(discovery, dryRun);
  const baseBranch =
    discovery.default_branch ||
    defaultBranch(discovery.org, discovery.repo, dryRun);

  let tests_ran: string[] = [];
  let test_ok: boolean | null = null;
  if (options.runTests ?? process.env.LI_WORKSPACE_SWEEP_RUN_TESTS === "1") {
    const t = runTestCommands(discovery, dryRun);
    tests_ran = t.ran;
    test_ok = t.ok;
    if (test_ok === false) {
      return {
        discovery,
        tests_ran,
        test_ok,
        push: {
          ok: false,
          workspace: discovery.path,
          repo: discovery.repo,
          committed: false,
          pushed: false,
          branch,
          skipped: true,
          skip_reason: "tests failed — sweep aborted for this repo",
          error: `failed: ${tests_ran.join(", ")}`,
        },
      };
    }
  }

  if (!dryRun) {
    const addResult = safeGitAdd(discovery.path, discovery.porcelain, false);
    if (!addResult.ok) {
      return {
        discovery,
        tests_ran,
        test_ok,
        push: {
          ok: false,
          workspace: discovery.path,
          repo: discovery.repo,
          committed: false,
          pushed: false,
          branch,
          error: addResult.error,
        },
      };
    }
  }

  const testHint =
    discovery.test_commands.length > 0
      ? discovery.test_commands.map((c) => `- \`${c}\``).join("\n")
      : "- _No automatic test command detected — run repo CI after merge._";

  const push = commitPushOpenPr(discovery.path, {
    branch,
    baseBranch,
    org: discovery.org,
    repo: discovery.repo,
    commitMessage: `chore(${discovery.repo}): workspace sweep — save uncommitted work`,
    prTitle: `chore(${discovery.repo}): workspace sweep fallback`,
    prBody: [
      "<!-- li-agent workspace_sweeper -->",
      "## Workspace sweep (fallback safety)",
      "",
      "Uncommitted local work was committed and pushed by **workspace_sweeper** so nothing is lost on disk.",
      "",
      "### Suggested verification",
      testHint,
      "",
      tests_ran.length ? `### Tests run this sweep\n${tests_ran.map((c) => `- \`${c}\` → ${test_ok ? "pass" : "fail/skip"}`).join("\n")}` : "",
      "",
      "_Review diff before merge. Do not self-merge governance PRs._",
    ]
      .filter(Boolean)
      .join("\n"),
    dryRun,
    skipPush,
    skipGitAdd: true,
  });

  return {
    discovery,
    tests_ran,
    test_ok,
    push: { ...push, workspace: discovery.path, repo: discovery.repo },
  };
}

export async function runWorkspaceDirtySweep(
  options: WorkspaceSweepOptions = {},
): Promise<WorkspaceSweepReport> {
  const scanRoots = options.roots ?? resolveSweepRoots(options.benchmarksRoot);
  const dirty = discoverDirtyRepos(scanRoots);
  const maxRepos = options.maxRepos ?? Number(process.env.LI_WORKSPACE_SWEEP_MAX_REPOS ?? 3);
  const targets = dirty.slice(0, Math.max(1, maxRepos));

  const sweeps: RepoSweepResult[] = [];
  for (const d of targets) {
    sweeps.push(sweepOneRepo(d, options));
  }

  const anyPushed = sweeps.some((s) => s.push.pushed);
  let restart: WorkspaceSweepReport["restart"];
  if ((options.restart ?? true) && anyPushed) {
    restart = await restartControlPlaneStack({ dryRun: options.dryRun });
  }

  return {
    generated_at: new Date().toISOString(),
    repos_scanned: scanRoots.length,
    dirty_found: dirty.length,
    sweeps,
    restart,
  };
}

export function formatWorkspaceSweepReport(report: WorkspaceSweepReport): string {
  const lines = [
    "# Workspace sweeper",
    "",
    `Generated: ${report.generated_at}`,
    "",
    `- Dirty repos found: **${report.dirty_found}**`,
    `- Swept this run: **${report.sweeps.length}**`,
    "",
    "## Executive summary",
  ];

  if (report.sweeps.length === 0) {
    lines.push("- No dirty sibling repos under sweep roots — nothing to commit.");
  } else {
    for (const s of report.sweeps) {
      const p = s.push;
      const pr = p.pr_url ? `PR ${p.pr_url}` : p.skip_reason ?? p.error ?? "no PR";
      lines.push(`- **${s.discovery.org}/${s.discovery.repo}** (\`${s.discovery.path}\`): ${pr}`);
      if (s.tests_ran.length) {
        lines.push(`  - Tests: ${s.tests_ran.join(", ")} (${s.test_ok === true ? "ok" : s.test_ok === false ? "failed" : "skipped"})`);
      }
      if (s.discovery.test_commands.length) {
        lines.push(`  - Verify: ${s.discovery.test_commands.join(" · ")}`);
      }
    }
  }

  if (report.restart) {
    lines.push("", "## Control plane restart", `- ${report.restart.message}`);
  }

  lines.push(
    "",
    "## Agent deliverable",
    "- [x] Scanned sibling clones for uncommitted work",
    report.sweeps.some((s) => s.push.pr_url)
      ? "- [x] Opened PR(s) for dirty repos"
      : "- [ ] No PR opened (clean or push skipped)",
    "- [x] Documented test commands per repo",
    report.restart?.ok ? "- [x] Restarted dashboard/supervisor stack" : "- [ ] Stack restart skipped or failed",
    "",
    "## Deferred",
    report.dirty_found > report.sweeps.length
      ? `- ${report.dirty_found - report.sweeps.length} additional dirty repo(s) — re-run sweeper or raise LI_WORKSPACE_SWEEP_MAX_REPOS`
      : "- None",
  );

  return lines.join("\n");
}
