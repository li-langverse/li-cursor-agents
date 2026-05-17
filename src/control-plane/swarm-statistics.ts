import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRunTrace, AgentRunTraceFileEdit } from "../agent-run-trace.js";
import { extractPrUrls } from "./run-completion.js";
import { readJson } from "./read-json.js";
import { controlPlaneRoot } from "./paths.js";
import { listRunsMerged, type RunCatalogEntry } from "./runs-catalog.js";
import { resolveBenchmarksRoot } from "../preflight.js";

export interface SwarmStatistics {
  generated_at: string;
  runs_scanned: number;
  /** Tool calls across recorded runs */
  actions_taken: number;
  file_edits: number;
  lines_added: number;
  lines_deleted: number;
  /** Unique PR URLs agents reported opening (run outputs + rollouts) */
  prs_opened: number;
  /** Open PRs in latest briefing snapshot */
  prs_open_now: number;
  /** Agent-tagged PRs currently open (deliverable gate sweep) */
  agent_prs_open_now: number;
  prs_merged: number;
  packages_created: number;
  briefing_generated_at?: string;
  notes: string[];
}

interface PersistedCounters {
  merged_pr_keys: string[];
  opened_pr_keys: string[];
  package_roots: string[];
  updated_at: string;
}

const MERGED_OUTPUT_RE =
  /\b(?:merged|successfully merged)\b[^.\n]{0,80}(?:pull\/\d+|#\d+)|gh pr merge\b/i;
const PACKAGE_OUTPUT_RE =
  /\b(?:li-new-package|create-li-package|lip init|packages\/li-[\w-]+)\b/i;

function swarmStatsPath(): string {
  return join(controlPlaneRoot(), "swarm-stats.json");
}

function loadPersisted(): PersistedCounters {
  const raw = readJson(swarmStatsPath());
  if (!raw || typeof raw !== "object") {
    return { merged_pr_keys: [], opened_pr_keys: [], package_roots: [], updated_at: "" };
  }
  const o = raw as Record<string, unknown>;
  return {
    merged_pr_keys: Array.isArray(o.merged_pr_keys) ? (o.merged_pr_keys as string[]) : [],
    opened_pr_keys: Array.isArray(o.opened_pr_keys) ? (o.opened_pr_keys as string[]) : [],
    package_roots: Array.isArray(o.package_roots) ? (o.package_roots as string[]) : [],
    updated_at: String(o.updated_at ?? ""),
  };
}

function savePersisted(p: PersistedCounters): void {
  p.updated_at = new Date().toISOString();
  writeFileSync(swarmStatsPath(), `${JSON.stringify(p, null, 2)}\n`, "utf8");
}

function prKeyFromUrl(url: string): string | null {
  const m = /github\.com\/([^/]+)\/[^/]+\/pull\/(\d+)/i.exec(url);
  if (!m) return null;
  return `${m[1]}#${m[2]}`;
}

function prKey(repo: string, num: number | string): string {
  return `${repo}#${num}`;
}

export function aggregateRunTraceStats(trace?: AgentRunTrace): {
  tools: number;
  edits: number;
  lines_added: number;
  lines_deleted: number;
  packageRoots: Set<string>;
} {
  const packageRoots = new Set<string>();
  let edits = 0;
  let lines_added = 0;
  let lines_deleted = 0;
  for (const e of trace?.file_edits ?? []) {
    edits++;
    lines_added += e.lines_added ?? 0;
    lines_deleted += e.lines_removed ?? 0;
    notePackageRoot(e, packageRoots);
  }
  return {
    tools: trace?.tool_call_count ?? 0,
    edits,
    lines_added,
    lines_deleted,
    packageRoots,
  };
}

function notePackageRoot(e: AgentRunTraceFileEdit, roots: Set<string>): void {
  const m = /(?:^|\/)packages\/(li-[\w.-]+)\//.exec(e.path.replace(/\\/g, "/"));
  if (!m) return;
  if (e.tool === "write" || e.tool === "edit") roots.add(m[1]);
}

function scanRunText(run: RunCatalogEntry): {
  merged: string[];
  opened: string[];
  packageHints: string[];
} {
  const merged: string[] = [];
  const opened: string[] = [];
  const packageHints: string[] = [];
  const chunks: string[] = [];
  if (run.output_preview) chunks.push(run.output_preview);
  if (run.summary) chunks.push(run.summary);
  if (run.md_path && existsSync(run.md_path)) {
    try {
      chunks.push(readFileSync(run.md_path, "utf8"));
    } catch {
      /* ignore */
    }
  }
  const text = chunks.join("\n");
  if (MERGED_OUTPUT_RE.test(text)) {
    for (const u of extractPrUrls(text)) {
      const k = prKeyFromUrl(u);
      if (k) merged.push(k);
    }
    const hash = text.match(/\b(\w+)#\d+\b/g);
    if (hash) merged.push(...hash.map((h) => h.toLowerCase()));
  }
  for (const u of extractPrUrls(text)) {
    const k = prKeyFromUrl(u);
    if (k) opened.push(k);
  }
  if (PACKAGE_OUTPUT_RE.test(text)) {
    const pm = text.match(/packages\/(li-[\w.-]+)/g);
    if (pm) packageHints.push(...pm.map((p) => p.replace("packages/", "")));
  }
  return { merged, opened, packageHints };
}

function briefingPaths(root: string): { briefing: string; prProgram: string; gate: string } {
  const latest = join(root, "data", "latest");
  return {
    briefing: join(latest, "agent-briefing.json"),
    prProgram: join(latest, "pr-program-run.json"),
    gate: join(latest, "agent-pr-deliverable-gate.json"),
  };
}

function mergedFromBriefingArtifacts(root: string | undefined): string[] {
  if (!root) return [];
  const keys: string[] = [];
  const { prProgram, gate } = briefingPaths(root);
  const prog = readJson(prProgram) as Record<string, unknown> | null;
  const exec = prog?.execute as Record<string, unknown> | undefined;
  for (const item of (exec?.merged as string[]) ?? []) {
    if (typeof item === "string") keys.push(item.toLowerCase());
  }
  const gateDoc = readJson(gate) as Record<string, unknown> | null;
  for (const row of (gateDoc?.results as Array<Record<string, unknown>>) ?? []) {
    if (String(row.merge_state ?? "").toUpperCase() === "MERGED") {
      const repo = String(row.repo ?? "");
      const num = row.number;
      if (repo && num != null) keys.push(prKey(repo, Number(num)));
    }
  }
  return keys;
}

function agentOpenPrCount(root: string | undefined): number {
  if (!root) return 0;
  const gate = readJson(briefingPaths(root).gate) as Record<string, unknown> | null;
  const results = (gate?.results as Array<Record<string, unknown>>) ?? [];
  return results.filter((r) => r.is_agent_pr === true).length;
}

function openPrCountFromBriefing(root: string | undefined): { open: number; generated_at?: string } {
  if (!root) return { open: 0 };
  const b = readJson(briefingPaths(root).briefing) as Record<string, unknown> | null;
  if (!b) return { open: 0 };
  const pr = b.pr_program as Record<string, unknown> | undefined;
  const all = (pr?.all_open as unknown[]) ?? [];
  const summary = pr?.summary as Record<string, unknown> | undefined;
  const open = all.length || Number(summary?.open_prs ?? pr?.open ?? 0);
  return { open: Number(open) || 0, generated_at: String(b.generated_at ?? "") || undefined };
}

function fetchMergedViaGh(): { keys: string[]; note?: string } {
  if (process.env.LI_SWARM_STATS_SKIP_GH === "1") return { keys: [] };
  if (spawnSync("which", ["gh"], { encoding: "utf8" }).status !== 0) {
    return { keys: [], note: "gh not installed — merged count from runs/briefing only" };
  }
  const proc = spawnSync(
    "gh",
    [
      "search",
      "prs",
      "--owner",
      "li-langverse",
      "--merged",
      "--limit",
      "100",
      "--json",
      "number,repository,labels,title",
    ],
    { encoding: "utf8", timeout: 20_000 },
  );
  if (proc.status !== 0 || !proc.stdout?.trim()) {
    return { keys: [], note: "gh search failed — merged count from runs/briefing only" };
  }
  try {
    const rows = JSON.parse(proc.stdout) as Array<{
      number: number;
      repository?: { name?: string };
      labels?: Array<{ name?: string }>;
      title?: string;
    }>;
    const agentLabels = new Set(["cursor-agent", "li-agent", "agent-incomplete"]);
    const keys: string[] = [];
    for (const row of rows) {
      const repo = row.repository?.name ?? "";
      if (!repo) continue;
      const labels = (row.labels ?? []).map((l) => l.name ?? "");
      const isAgent =
        labels.some((l) => agentLabels.has(l)) ||
        /agent deliverable|cursor agent|li-agent/i.test(row.title ?? "");
      if (isAgent) keys.push(prKey(repo, row.number));
    }
    return { keys };
  } catch {
    return { keys: [], note: "gh JSON parse failed" };
  }
}

function aggregateRuns(runs: RunCatalogEntry[]): Omit<
  SwarmStatistics,
  "generated_at" | "prs_open_now" | "agent_prs_open_now" | "prs_merged" | "briefing_generated_at" | "notes"
> & {
  mergedKeys: Set<string>;
  openedKeys: Set<string>;
  packageRoots: Set<string>;
} {
  let actions_taken = 0;
  let file_edits = 0;
  let lines_added = 0;
  let lines_deleted = 0;
  const mergedKeys = new Set<string>();
  const openedKeys = new Set<string>();
  const packageRoots = new Set<string>();

  for (const run of runs) {
    const t = aggregateRunTraceStats(run.run_trace);
    actions_taken += t.tools;
    file_edits += t.edits;
    lines_added += t.lines_added;
    lines_deleted += t.lines_deleted;
    for (const p of t.packageRoots) packageRoots.add(p);

    for (const u of run.pr_urls ?? []) {
      const k = prKeyFromUrl(u);
      if (k) openedKeys.add(k);
    }

    const textScan = scanRunText(run);
    for (const k of textScan.opened) openedKeys.add(k);
    for (const k of textScan.merged) mergedKeys.add(k);
    for (const p of textScan.packageHints) packageRoots.add(p);
  }

  return {
    runs_scanned: runs.length,
    actions_taken,
    file_edits,
    lines_added,
    lines_deleted,
    prs_opened: openedKeys.size,
    packages_created: packageRoots.size,
    mergedKeys,
    openedKeys,
    packageRoots,
  };
}

export interface BuildSwarmStatisticsOptions {
  runLimit?: number;
  /** Skip `gh search` (blocks ~20s); use runs + briefing artifacts only. */
  skipGh?: boolean;
}

export async function buildSwarmStatistics(
  runLimit = 400,
  options: BuildSwarmStatisticsOptions = {},
): Promise<SwarmStatistics> {
  const notes: string[] = [];
  const benchmarksRoot = resolveBenchmarksRoot();
  const limit = options.runLimit ?? runLimit;
  const runs = await listRunsMerged(limit);
  const agg = aggregateRuns(runs);

  const persisted = loadPersisted();
  for (const k of agg.openedKeys) {
    if (!persisted.opened_pr_keys.includes(k)) persisted.opened_pr_keys.push(k);
  }
  for (const k of agg.mergedKeys) {
    if (!persisted.merged_pr_keys.includes(k)) persisted.merged_pr_keys.push(k);
  }
  for (const p of agg.packageRoots) {
    if (!persisted.package_roots.includes(p)) persisted.package_roots.push(p);
  }

  for (const k of mergedFromBriefingArtifacts(benchmarksRoot)) {
    if (!persisted.merged_pr_keys.includes(k)) persisted.merged_pr_keys.push(k);
  }

  const skipGh =
    options.skipGh === true ||
    process.env.LI_SWARM_STATS_SKIP_GH === "1" ||
    process.env.LI_SWARM_STATS_SKIP_GH === "true";
  if (!skipGh) {
    const gh = fetchMergedViaGh();
    if (gh.note) notes.push(gh.note);
    for (const k of gh.keys) {
      if (!persisted.merged_pr_keys.includes(k)) persisted.merged_pr_keys.push(k);
    }
  } else {
    notes.push("gh merge search skipped (dashboard fast path — use ?refresh=1 for full gh sweep)");
  }

  savePersisted(persisted);

  const { open, generated_at } = openPrCountFromBriefing(benchmarksRoot);
  const agentOpen = agentOpenPrCount(benchmarksRoot);

  return {
    generated_at: new Date().toISOString(),
    runs_scanned: agg.runs_scanned,
    actions_taken: agg.actions_taken,
    file_edits: agg.file_edits,
    lines_added: agg.lines_added,
    lines_deleted: agg.lines_deleted,
    prs_opened: Math.max(agg.openedKeys.size, persisted.opened_pr_keys.length),
    prs_open_now: open,
    agent_prs_open_now: agentOpen,
    prs_merged: persisted.merged_pr_keys.length,
    packages_created: Math.max(agg.packageRoots.size, persisted.package_roots.length),
    briefing_generated_at: generated_at,
    notes,
  };
}
