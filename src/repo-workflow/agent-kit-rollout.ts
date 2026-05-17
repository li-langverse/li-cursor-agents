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

function branchName(repo: string, canonicalVersion: string): string {
  const safe = canonicalVersion.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `chore/agent-kit-${safe}-${repo}`;
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
    const branch = branchName(repo, canonVersion);

    const prep = prepareIsolatedClone(repo, {
      org,
      runId,
      workspaceRoot: options.workspaceRoot,
      dryRun,
      branchName: branch,
    });

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

    rows.push({
      repo,
      workspace: prep.cloneDir,
      install_ok: true,
      workflow_ok: pr.ok,
      pr_url: pr.pr_url,
      skipped: pr.skipped,
      skip_reason: pr.skip_reason,
      governance,
      error: pr.error,
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
