import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadRuntimeEnv } from "../env.js";
import {
  adoptionContextFromBriefing,
  needingSyncFromBriefing,
  resolveRoadmapRoot,
} from "../preflight/agent-kit-sync.js";
import { commitPushOpenPr } from "./pr.js";
import { runCmd } from "./git.js";
import { cloneDirFor, isGovernanceRepo, prepareIsolatedClone } from "./workspace.js";
import type { AgentKitRolloutRow, RepoWorkflowOptions } from "./types.js";

function installAgentKit(
  roadmapRoot: string,
  cloneDir: string,
  repo: string,
  dryRun: boolean,
): { ok: boolean; stderr: string } {
  const installer = join(roadmapRoot, "scripts", "install-agent-kit.sh");
  if (!existsSync(installer)) {
    return { ok: false, stderr: `missing ${installer}` };
  }
  if (dryRun) {
    return { ok: true, stderr: "" };
  }
  const proc = spawnSync("bash", [installer, cloneDir], {
    encoding: "utf8",
    env: { ...process.env, ROADMAP_ROOT: roadmapRoot },
  });
  return {
    ok: proc.status === 0,
    stderr: (proc.stderr ?? proc.stdout ?? "").trim().slice(-1500),
  };
}

/** Stable branch name used across org agent-kit sync PRs. */
export function syncBranchName(repo: string): string {
  return `chore/agent-kit-sync-${repo}`;
}

function remoteBranchExists(org: string, repo: string, branch: string, dryRun: boolean): boolean {
  if (dryRun) return false;
  const r = runCmd(
    "gh",
    ["api", `repos/${org}/${repo}/git/ref/heads/${branch}`, "--silent"],
    process.cwd(),
    false,
  );
  return r.ok;
}

function openPrForBranch(org: string, repo: string, branch: string, dryRun: boolean): string | undefined {
  if (dryRun) return undefined;
  const r = runCmd(
    "gh",
    ["pr", "list", "--repo", `${org}/${repo}`, "--head", branch, "--state", "open", "--json", "url"],
    process.cwd(),
    false,
  );
  if (!r.ok || !r.stdout) return undefined;
  try {
    const rows = JSON.parse(r.stdout) as { url?: string }[];
    return rows[0]?.url;
  } catch {
    return undefined;
  }
}

/** Isolated clone → install agent-kit → commit → push → open PR per drifted repo. */
export function rolloutAgentKitPrs(
  benchmarksRoot: string,
  briefing: unknown,
  options: RepoWorkflowOptions = {},
): AgentKitRolloutRow[] {
  loadRuntimeEnv();

  const dryRun =
    options.dryRun ??
    (process.env.LI_REPO_WORKFLOW_DRY_RUN === "1" || process.env.CURSOR_MOCK === "1");
  const skipPush = options.skipPush ?? process.env.LI_REPO_WORKFLOW_SKIP_PUSH === "1";
  const org = options.org ?? process.env.GH_ORG ?? "li-langverse";
  const runId = options.runId ?? `agent-kit-${Date.now()}`;
  const roadmap = resolveRoadmapRoot(benchmarksRoot);

  const adoption = adoptionContextFromBriefing(briefing);
  const canonVersion = adoption?.canonical_version ?? "sync";
  const canonStamp = adoption?.canonical_stamp ?? canonVersion;
  const entries = needingSyncFromBriefing(briefing);

  if (!roadmap && !dryRun) {
    return entries.map((e) => ({
      repo: e.repo,
      install_ok: false,
      workflow_ok: false,
      error: "roadmap agent-kit not found",
    }));
  }

  const rows: AgentKitRolloutRow[] = [];

  for (const entry of entries) {
    const repo = entry.repo;
    const governance = isGovernanceRepo(repo);
    const branch = syncBranchName(repo);
    const trackRemote = remoteBranchExists(org, repo, branch, dryRun);
    const prevTrack = process.env.LI_REPO_WORKFLOW_TRACK_REMOTE;
    if (trackRemote) process.env.LI_REPO_WORKFLOW_TRACK_REMOTE = "1";

    let prep;
    try {
      prep = prepareIsolatedClone(repo, {
        org,
        runId,
        workspaceRoot: options.workspaceRoot,
        dryRun,
        branchName: branch,
      });
    } finally {
      if (prevTrack !== undefined) process.env.LI_REPO_WORKFLOW_TRACK_REMOTE = prevTrack;
      else delete process.env.LI_REPO_WORKFLOW_TRACK_REMOTE;
    }

    if (!prep.ok) {
      rows.push({
        repo,
        workspace: prep.cloneDir,
        install_ok: false,
        workflow_ok: false,
        governance,
        error: prep.error,
      });
      continue;
    }

    const install = roadmap
      ? installAgentKit(roadmap, prep.cloneDir, repo, dryRun)
      : { ok: true, stderr: "" };

    if (!install.ok) {
      rows.push({
        repo,
        workspace: prep.cloneDir,
        install_ok: false,
        workflow_ok: false,
        governance,
        error: install.stderr || "install-agent-kit failed",
      });
      continue;
    }

    const pr = commitPushOpenPr(prep.cloneDir, {
      branch,
      baseBranch: prep.baseBranch,
      org,
      repo,
      dryRun,
      skipPush,
      commitMessage: `chore(agent-kit): sync roadmap cursor policy to ${canonStamp}`,
      prTitle: `chore(agent-kit): sync roadmap cursor policy (${canonVersion})`,
      prBody: [
        "## Summary",
        `Sync shared Cursor agent-kit from roadmap to \`${canonStamp}\`.`,
        "",
        "## Agent continuation",
        "1. Review preserved repo rules and hook merges.",
        "2. CI must be green before merge.",
        governance ? "3. **Governance repo** — human reviewer merges (agents do not self-merge)." : "",
        "",
        "Automated by `li-cursor-agents` repo-workflow (isolated workspace).",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    let workflowOk = pr.ok;
    let prUrl = pr.pr_url;
    let skipped = pr.skipped;
    let skipReason = pr.skip_reason;
    let error = pr.error;

    if (!prUrl && !dryRun) {
      const existing = openPrForBranch(org, repo, branch, dryRun);
      if (existing) {
        workflowOk = true;
        prUrl = existing;
        skipped = true;
        skipReason = skipReason ?? "existing open PR for sync branch";
      }
    }

    rows.push({
      repo,
      workspace: prep.cloneDir,
      install_ok: true,
      workflow_ok: workflowOk,
      pr_url: prUrl,
      skipped,
      skip_reason: skipReason,
      governance,
      error,
    });
  }

  return rows;
}

export function formatRolloutDigest(rows: AgentKitRolloutRow[]): string {
  const lines = ["# Agent-kit rollout", ""];
  for (const r of rows) {
    if (r.pr_url) {
      lines.push(`- **${r.repo}**: ${r.pr_url}`);
    } else if (r.skipped) {
      lines.push(`- **${r.repo}**: skipped (${r.skip_reason ?? "—"})`);
    } else {
      lines.push(`- **${r.repo}**: failed — ${r.error ?? "unknown"}`);
    }
  }
  return lines.join("\n");
}

export function rolloutNeedsLlmFollowUp(rows: AgentKitRolloutRow[]): boolean {
  return rows.some((r) => !r.workflow_ok && !r.skipped);
}
