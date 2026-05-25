import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { gitStatusPorcelain } from "./git.js";
import { workspacesRoot } from "./workspace.js";

export interface WorkspacePruneOptions {
  workspaceRoot?: string;
  org?: string;
  maxAgeDays?: number;
  keepPerRepo?: number;
  maxRunsPerRepo?: number;
  dryRun?: boolean;
  /** Delete even when the clone has uncommitted changes. */
  force?: boolean;
  /** Bypass LI_WORKSPACE_PRUNE_INTERVAL_MS throttle. */
  skipThrottle?: boolean;
}

export interface WorkspacePruneDeleted {
  repo: string;
  run_id: string;
  age_ms: number;
  bytes: number;
}

export interface WorkspacePruneReport {
  dry_run: boolean;
  org: string;
  repos_scanned: number;
  runs_found: number;
  runs_deleted: number;
  runs_skipped_dirty: number;
  runs_skipped_protected: number;
  runs_skipped_young: number;
  bytes_freed: number;
  deleted: WorkspacePruneDeleted[];
}

let lastPruneAt = 0;

function pruneMode(): "always" | "never" {
  const raw = process.env.LI_WORKSPACE_PRUNE?.trim() ?? "always";
  return raw === "never" ? "never" : "always";
}

function envNumber(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) ? n : fallback;
}

/** Milliseconds since run start from `{agent}-{timestamp}` suffix or directory mtime. */
export function parseRunTimestamp(runId: string): number | null {
  const m = runId.match(/-(\d{10,})$/);
  if (!m) return null;
  const ts = Number(m[1]);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

export function runDirAgeMs(runDir: string, runId: string): number {
  const ts = parseRunTimestamp(runId);
  if (ts != null) return Math.max(0, Date.now() - ts);
  try {
    return Math.max(0, Date.now() - statSync(runDir).mtimeMs);
  } catch {
    return 0;
  }
}

function dirSizeBytes(dir: string): number {
  let total = 0;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) total += dirSizeBytes(p);
    else if (ent.isFile()) total += statSync(p).size;
  }
  return total;
}

function protectedRunDirs(): Set<string> {
  const ws = process.env.LI_REPO_WORKFLOW_WORKSPACE?.trim();
  if (!ws) return new Set();
  return new Set([join(ws, "..")]);
}

function isDirtyClone(repoPath: string): boolean {
  if (!existsSync(join(repoPath, ".git"))) return false;
  return Boolean(gitStatusPorcelain(repoPath, false).trim());
}

function listRepoRunDirs(repoPath: string): Array<{ runId: string; runDir: string; ageMs: number }> {
  if (!existsSync(repoPath)) return [];
  const out: Array<{ runId: string; runDir: string; ageMs: number }> = [];
  for (const runId of readdirSync(repoPath)) {
    const runDir = join(repoPath, runId);
    try {
      if (!statSync(runDir).isDirectory()) continue;
    } catch {
      continue;
    }
    if (!existsSync(join(runDir, "repo"))) continue;
    out.push({ runId, runDir, ageMs: runDirAgeMs(runDir, runId) });
  }
  return out;
}

export function pruneWorkspaces(options: WorkspacePruneOptions = {}): WorkspacePruneReport {
  const root = workspacesRoot(options.workspaceRoot);
  const org = options.org ?? process.env.GH_ORG ?? "li-langverse";
  const orgPath = join(root, org);
  const maxAgeMs = (options.maxAgeDays ?? envNumber("LI_WORKSPACE_PRUNE_MAX_AGE_DAYS", 7)) * 86_400_000;
  const keepPerRepo = options.keepPerRepo ?? envNumber("LI_WORKSPACE_PRUNE_KEEP_PER_REPO", 5);
  const maxRunsPerRepo = options.maxRunsPerRepo ?? envNumber("LI_WORKSPACE_PRUNE_MAX_RUNS_PER_REPO", 20);
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? process.env.LI_WORKSPACE_PRUNE_FORCE === "1";
  const protectedDirs = protectedRunDirs();

  const report: WorkspacePruneReport = {
    dry_run: dryRun,
    org,
    repos_scanned: 0,
    runs_found: 0,
    runs_deleted: 0,
    runs_skipped_dirty: 0,
    runs_skipped_protected: 0,
    runs_skipped_young: 0,
    bytes_freed: 0,
    deleted: [],
  };

  if (!existsSync(orgPath)) return report;

  for (const repo of readdirSync(orgPath)) {
    const repoPath = join(orgPath, repo);
    try {
      if (!statSync(repoPath).isDirectory()) continue;
    } catch {
      continue;
    }
    report.repos_scanned += 1;

    const runs = listRepoRunDirs(repoPath);
    report.runs_found += runs.length;
    if (runs.length === 0) continue;

    const newestFirst = [...runs].sort((a, b) => a.ageMs - b.ageMs);
    const rankByRunId = new Map(newestFirst.map((r, i) => [r.runId, i]));

    for (const run of runs) {
      const rankFromNewest = rankByRunId.get(run.runId) ?? 0;
      if (rankFromNewest < keepPerRepo) {
        report.runs_skipped_protected += 1;
        continue;
      }
      const overCap = rankFromNewest >= maxRunsPerRepo;
      const tooOld = run.ageMs >= maxAgeMs;
      if (!overCap && !tooOld) {
        report.runs_skipped_young += 1;
        continue;
      }
      if (protectedDirs.has(run.runDir)) {
        report.runs_skipped_protected += 1;
        continue;
      }
      const clonePath = join(run.runDir, "repo");
      if (!force && isDirtyClone(clonePath)) {
        report.runs_skipped_dirty += 1;
        continue;
      }

      const bytes = dirSizeBytes(run.runDir);
      if (!dryRun) {
        rmSync(run.runDir, { recursive: true, force: true });
      }
      report.runs_deleted += 1;
      report.bytes_freed += bytes;
      report.deleted.push({
        repo,
        run_id: run.runId,
        age_ms: run.ageMs,
        bytes,
      });
    }
  }

  return report;
}

/** Throttled prune for hot paths (new clone, supervisor tick). Returns null when skipped. */
export function maybePruneWorkspaces(options: WorkspacePruneOptions = {}): WorkspacePruneReport | null {
  if (pruneMode() === "never") return null;
  if (!options.skipThrottle) {
    const interval = envNumber("LI_WORKSPACE_PRUNE_INTERVAL_MS", 3_600_000);
    if (Date.now() - lastPruneAt < interval) return null;
  }
  const report = pruneWorkspaces(options);
  lastPruneAt = Date.now();
  return report;
}

export function formatWorkspacePruneReport(report: WorkspacePruneReport): string {
  const mb = (report.bytes_freed / (1024 * 1024)).toFixed(1);
  const lines = [
    `workspace prune (${report.dry_run ? "dry-run" : "applied"}) org=${report.org}`,
    `repos=${report.repos_scanned} runs=${report.runs_found} deleted=${report.runs_deleted} (~${mb} MiB)`,
    `skipped: protected=${report.runs_skipped_protected} young=${report.runs_skipped_young} dirty=${report.runs_skipped_dirty}`,
  ];
  if (report.deleted.length > 0 && report.deleted.length <= 12) {
    for (const d of report.deleted) {
      const ageDays = (d.age_ms / 86_400_000).toFixed(1);
      lines.push(`  - ${d.repo}/${d.run_id} (${ageDays}d, ${(d.bytes / (1024 * 1024)).toFixed(1)} MiB)`);
    }
  } else if (report.deleted.length > 12) {
    lines.push(`  … ${report.deleted.length} run directories removed`);
  }
  return lines.join("\n");
}

/** Test helper */
export function resetWorkspacePruneThrottle(): void {
  lastPruneAt = 0;
}
