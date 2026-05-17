import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentKitRolloutRow } from "../repo-workflow/types.js";

export interface AgentKitAuditEntry {
  repo: string;
  status?: string;
  behind_reason?: string;
  fix?: string;
  present_locally?: boolean;
  cursor_version?: string | null;
  canonical_version?: string | null;
}

export interface AgentKitAdoptionContext {
  required: boolean;
  kit_bumped: boolean;
  canonical_stamp?: string;
  canonical_version?: string;
  previous_canonical_stamp?: string;
  summary?: string;
  steps?: string[];
  repos_version_behind?: string[];
}

export interface AgentKitSyncResult {
  repo: string;
  ok: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
}

const SKIP_STATUSES = new Set(["ok", "missing_local_clone"]);

export function resolveRoadmapRoot(benchmarksRoot: string): string | undefined {
  const env = process.env.ROADMAP_ROOT;
  if (env && existsSync(join(env, "agent-kit", "manifest.toml"))) return env;
  const sibling = join(benchmarksRoot, "..", "roadmap");
  if (existsSync(join(sibling, "agent-kit", "manifest.toml"))) return sibling;
  return undefined;
}

export function adoptionContextFromBriefing(briefing: unknown): AgentKitAdoptionContext | undefined {
  if (!briefing || typeof briefing !== "object") return undefined;
  const audit = (briefing as Record<string, unknown>).org_agent_kit_audit;
  if (!audit || typeof audit !== "object") return undefined;
  const a = audit as Record<string, unknown>;
  const adoption =
    a.downstream_adoption && typeof a.downstream_adoption === "object"
      ? (a.downstream_adoption as AgentKitAdoptionContext)
      : ({} as AgentKitAdoptionContext);
  const needing = Array.isArray(a.repos_needing_sync) ? a.repos_needing_sync.length > 0 : false;
  return {
    required: adoption.required ?? needing,
    kit_bumped: adoption.kit_bumped ?? a.kit_bumped === true,
    canonical_stamp:
      adoption.canonical_stamp ??
      (typeof a.canonical_stamp === "string" ? a.canonical_stamp : undefined),
    canonical_version:
      adoption.canonical_version ??
      (typeof a.canonical_version === "string" ? a.canonical_version : undefined),
    previous_canonical_stamp:
      adoption.previous_canonical_stamp ??
      (typeof a.previous_canonical_stamp === "string" ? a.previous_canonical_stamp : undefined),
    summary: adoption.summary,
    steps: adoption.steps,
    repos_version_behind: Array.isArray(a.repos_version_behind)
      ? (a.repos_version_behind as string[])
      : adoption.repos_version_behind,
  };
}

export function agentKitBumpActive(briefing: unknown): boolean {
  const ctx = adoptionContextFromBriefing(briefing);
  if (!ctx) return false;
  return ctx.kit_bumped || (ctx.repos_version_behind?.length ?? 0) > 0;
}

export function needingSyncFromBriefing(briefing: unknown): AgentKitAuditEntry[] {
  if (!briefing || typeof briefing !== "object") return [];
  const audit = (briefing as Record<string, unknown>).org_agent_kit_audit;
  if (!audit || typeof audit !== "object") return [];
  const rows = (audit as Record<string, unknown>).repos_needing_sync;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (r): r is AgentKitAuditEntry =>
      r !== null &&
      typeof r === "object" &&
      typeof (r as AgentKitAuditEntry).repo === "string" &&
      !SKIP_STATUSES.has(String((r as AgentKitAuditEntry).status ?? "")),
  );
}

/** Run roadmap install-agent-kit.sh for drifted repos (deterministic sync). */
export function syncAgentKitDrift(
  benchmarksRoot: string,
  briefing: unknown,
  options?: { maxRepos?: number },
): AgentKitSyncResult[] {
  const roadmap = resolveRoadmapRoot(benchmarksRoot);
  if (!roadmap) return [];

  const installer = join(roadmap, "scripts", "install-agent-kit.sh");
  if (!existsSync(installer)) return [];

  const max = options?.maxRepos ?? Number(process.env.LI_AGENT_KIT_SYNC_MAX ?? 8);
  const entries = needingSyncFromBriefing(briefing).slice(0, max);
  const out: AgentKitSyncResult[] = [];

  for (const entry of entries) {
    const proc = spawnSync("bash", [installer, entry.repo], {
      encoding: "utf8",
      env: { ...process.env, ROADMAP_ROOT: roadmap },
    });
    out.push({
      repo: entry.repo,
      ok: proc.status === 0,
      exit_code: proc.status ?? 1,
      stdout: (proc.stdout ?? "").trim().slice(-2000),
      stderr: (proc.stderr ?? "").trim().slice(-2000),
    });
  }

  return out;
}

export function refreshAgentKitAudit(benchmarksRoot: string): number | undefined {
  const script = join(benchmarksRoot, "scripts", "ensure-org-agent-kit.py");
  if (!existsSync(script)) return undefined;
  const proc = spawnSync("python3", [script, "--local-only"], {
    cwd: benchmarksRoot,
    encoding: "utf8",
    env: process.env,
  });
  return proc.status ?? 1;
}

export function buildAgentKitMaintainerInstruction(
  syncResults: AgentKitSyncResult[],
  briefing?: unknown,
  rollout?: AgentKitRolloutRow[],
): string {
  const adoption = briefing ? adoptionContextFromBriefing(briefing) : undefined;
  const bumpSection: string[] = [];
  if (adoption?.kit_bumped) {
    bumpSection.push(
      "## Roadmap agent-kit bumped (downstream adoption)",
      "",
      `Canonical kit changed: **${adoption.previous_canonical_stamp ?? "?"}** → **${adoption.canonical_stamp ?? "?"}**`,
      "",
      adoption.summary ?? "",
      "",
      "After install, each repo may still need **repo-specific** follow-up (preserved rules, overlays, local hooks merge).",
      "",
      ...(adoption.steps ?? []).map((s, i) => `${i + 1}. ${s}`),
      "",
    );
  } else if ((adoption?.repos_version_behind?.length ?? 0) > 0) {
    bumpSection.push(
      "## Downstream behind canonical agent-kit",
      "",
      `Repos behind manifest **${adoption?.canonical_version}**: ${adoption!.repos_version_behind!.join(", ")}`,
      "",
      "Install copies shared `.cursor` policy; open one PR per repo with local changes.",
      "",
    );
  }

  const rolloutSection: string[] = [];
  if (rollout && rollout.length > 0) {
    rolloutSection.push(
      "## Isolated repo workflow (clone → install → PR)",
      "",
      "| repo | PR | notes |",
      "|------|-----|-------|",
      ...rollout.map((r) => {
        const pr = r.pr_url ? `[open](${r.pr_url})` : r.skipped ? `skipped: ${r.skip_reason}` : `failed`;
        return `| ${r.repo} | ${pr} | ${r.governance ? "governance — human merge" : r.workspace ?? ""} |`;
      }),
      "",
    );
  }

  if (syncResults.length === 0 && (!rollout || rollout.length === 0)) {
    return [
      ...bumpSection,
      ...rolloutSection,
      "## Agent-kit sync (control plane)",
      "No rollout ran. Use `npm run repo-workflow -- agent-kit-rollout` or start **agent_kit_maintainer** with GH_TOKEN set.",
    ].join("\n");
  }

  const lines = [
    ...bumpSection,
    ...rolloutSection,
    "## Agent-kit sync (control plane — already ran install)",
    "",
    "Deterministic `install-agent-kit.sh` was run for these repos before this agent pass:",
    "",
    "| repo | install ok |",
    "|------|------------|",
    ...syncResults.map((r) => `| ${r.repo} | ${r.ok ? "yes" : `no (exit ${r.exit_code})`} |`),
    "",
    "## Your task (only if rollout rows show failed or need manual fix)",
    "1. Work in `data/workspaces/<org>/<repo>/<run>/repo` clones — do not edit sibling monorepo copies unless debugging.",
    "2. For failures: fix install/PR errors, or run `npm run repo-workflow -- prepare|commit-pr`.",
    "3. Review **preserve** paths / overlays (`roadmap/agent-kit/manifest.toml`).",
    "4. Do **not** self-merge; governance repos need human merge.",
    "5. Re-run audit: `cd benchmarks && python3 scripts/ensure-org-agent-kit.py --local-only`",
  ];

  const failed = syncResults.filter((r) => !r.ok);
  if (failed.length > 0) {
    lines.push(
      "",
      "### Install failures (fix before PR)",
      ...failed.map((r) => `- **${r.repo}**: ${r.stderr || r.stdout || "unknown error"}`),
    );
  }

  return lines.join("\n");
}
