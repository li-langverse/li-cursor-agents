import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getAgent } from "../agents/registry.js";
import { coordinatorForLeaf } from "../heap/coordinators.js";
import { mockRunsDir, runsDir } from "./paths.js";
import { listActiveRuns } from "./runtime.js";
import { loadWorkerStatusFromDb } from "../db/worker-status.js";
import type { ActiveAgentRun } from "./types.js";
import { loadState, loadStateForApi } from "./state.js";
import { readJson } from "./read-json.js";
import { reportPath } from "./paths.js";
import { dbEnabled, useDiskStore, useSupabaseStore } from "../db/client.js";
import {
  getRunById,
  getRunEvents,
  getRolloutsForRun,
  listAgentRunHistory,
  listRunsGlobal,
  listRunsGlobalInRange,
  type AgentRunHistoryRow,
} from "../db/runs.js";
import type { ParsedStatsTimeRange } from "./stats-time-range.js";
import type { AgentRunInputRecord, AgentRunTrace } from "../agent-run-trace.js";
import { filterProductionRuns, isMockCatalogEntry } from "./run-history.js";
import { listToActivityItems, type ActivityListItem } from "./activity-summary.js";
import type { AgentId } from "../types.js";

export type { ActivityListItem } from "./activity-summary.js";

export interface RunCatalogEntry {
  run_id: string;
  agent_id: string;
  started_at: string;
  status: string;
  backend?: string;
  md_path: string;
  json_path?: string;
  output_preview?: string;
  reason?: string;
  briefing_hash?: string;
  duration_ms?: number;
  live?: boolean;
  pid?: number;
  completion?: AgentRunHistoryRow["completion"];
  pr_urls?: string[];
  premature?: boolean;
  summary?: string;
  run_input?: AgentRunInputRecord;
  run_trace?: AgentRunTrace;
  meta?: Record<string, unknown>;
  trace_events?: Array<{ seq: number; event_type: string; payload: unknown }>;
}

function parseRunBasename(file: string): { agentId: string; ts: number } | null {
  const m = /^(.+)-(\d+)\.(md|json)$/.exec(file);
  if (!m) return null;
  return { agentId: m[1], ts: Number(m[2]) };
}

function isoFromTs(ts: number): string {
  return new Date(ts).toISOString();
}

function historyRowToCatalog(row: AgentRunHistoryRow): RunCatalogEntry {
  const md = row.output_path ?? join(runsDir(), `${row.run_id}.md`);
  return {
    run_id: row.run_id,
    agent_id: row.agent_id,
    started_at: row.started_at,
    status: row.status,
    backend: row.backend ?? undefined,
    md_path: md,
    json_path: md.replace(/\.md$/, ".json"),
    output_preview: row.summary ?? row.output_md?.slice(0, 600),
    reason: row.reason ?? undefined,
    briefing_hash: row.briefing_hash ?? undefined,
    duration_ms: row.duration_ms ?? undefined,
    completion: row.completion ?? undefined,
    pr_urls: row.pr_urls ?? [],
    premature: row.premature,
    summary: row.summary,
    run_input: row.run_input ?? undefined,
    run_trace: row.run_trace ?? undefined,
    meta: row.meta ?? undefined,
  };
}

export function listRunsFromDiskInRange(
  options: { since?: Date | null; until?: Date | null; limit?: number } = {},
): RunCatalogEntry[] {
  const limit = options.limit ?? 10_000;
  const sinceMs = options.since?.getTime() ?? null;
  const untilMs = options.until?.getTime() ?? null;
  const all = listRunsFromDisk(limit * 3);
  return all
    .filter((r) => {
      const t = new Date(r.started_at).getTime();
      if (sinceMs != null && t < sinceMs) return false;
      if (untilMs != null && t > untilMs) return false;
      return true;
    })
    .slice(0, limit);
}

function listMdFilesFromDirs(dirs: string[]): Array<{ md: string; dir: string }> {
  const out: Array<{ md: string; dir: string }> = [];
  for (const dir of dirs) {
    try {
      for (const md of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
        out.push({ md, dir });
      }
    } catch {
      /* missing dir */
    }
  }
  return out;
}

export function listRunsFromDisk(limit = 80): RunCatalogEntry[] {
  const dirs =
    process.env.LI_PERSIST_MOCK_RUNS === "1" ? [runsDir(), mockRunsDir()] : [runsDir()];
  const files = listMdFilesFromDirs(dirs);
  const entries: RunCatalogEntry[] = [];
  for (const { md, dir } of files) {
    const parsed = parseRunBasename(md);
    if (!parsed) continue;
    const full = join(dir, md);
    const jsonName = md.replace(/\.md$/, ".json");
    const jsonPath = join(dir, jsonName);
    let meta: Record<string, unknown> = {};
    if (existsSync(jsonPath)) {
      try {
        meta = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    }
    const completion = meta.completion as RunCatalogEntry["completion"];
    const backend = meta.backend as string | undefined;
    if (backend === "mock" && process.env.LI_PERSIST_MOCK_RUNS !== "1") continue;
    const preview = readPreview(full, 600);
    entries.push({
      run_id: md.replace(/\.md$/, ""),
      agent_id: (meta.agentId as string) ?? parsed.agentId,
      started_at: isoFromTs(parsed.ts),
      status: (meta.status as string) ?? "finished",
      backend: meta.backend as string | undefined,
      md_path: full,
      json_path: existsSync(jsonPath) ? jsonPath : undefined,
      output_preview: preview,
      reason: meta.reason as string | undefined,
      briefing_hash: meta.briefing_hash as string | undefined,
      duration_ms: meta.durationMs as number | undefined,
      completion,
      pr_urls: (completion?.pr_urls as string[]) ?? [],
      premature: completion?.premature,
      run_input: meta.runInput as AgentRunInputRecord | undefined,
      run_trace: meta.trace as AgentRunTrace | undefined,
    });
  }

  entries.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  return filterProductionRuns(entries).slice(0, limit);
}

export async function listRunsMerged(limit = 80): Promise<RunCatalogEntry[]> {
  return listRunsMergedInRange({ limit });
}

export async function listRunsMergedInRange(
  options: {
    since?: Date | null;
    until?: Date | null;
    limit?: number;
    /** Lighter Supabase select (for statistics). */
    forStatistics?: boolean;
  } = {},
): Promise<RunCatalogEntry[]> {
  const limit = options.limit ?? 10_000;
  if (useSupabaseStore()) {
    if (!dbEnabled()) return [];
    const fromDb = await listRunsGlobalInRange({
      since: options.since,
      until: options.until,
      limit,
      light: options.forStatistics,
    });
    return filterProductionRuns(fromDb.map(historyRowToCatalog));
  }
  return listRunsFromDiskInRange({ since: options.since, until: options.until, limit });
}

function catalogMdPathForRunId(runId: string): string {
  for (const dir of [runsDir(), mockRunsDir()]) {
    const p = join(dir, `${runId}.md`);
    if (existsSync(p)) return p;
  }
  return join(runsDir(), `${runId}.md`);
}

function liveRunToCatalog(r: ActiveAgentRun): RunCatalogEntry {
  return {
    run_id: r.run_id,
    agent_id: r.agent_id,
    started_at: r.started_at,
    status: r.status,
    md_path: catalogMdPathForRunId(r.run_id),
    reason: r.reason,
    live: true,
    pid: r.pid,
    output_preview: "_Running…_",
  };
}

/** In-process map (worker) + worker_status row (db-api on Next). */
export async function findActiveRunById(runId: string): Promise<ActiveAgentRun | null> {
  const inProc = listActiveRuns().find((r) => r.run_id === runId);
  if (inProc) return inProc;
  if (useSupabaseStore() && dbEnabled()) {
    const worker = await loadWorkerStatusFromDb();
    const fromWorker = worker?.active_runs?.find((r) => r.run_id === runId && r.status === "running");
    if (fromWorker) return fromWorker;
  }
  return null;
}

async function listLiveRunCatalogEntries(): Promise<RunCatalogEntry[]> {
  const byId = new Map<string, ActiveAgentRun>();
  if (useSupabaseStore() && dbEnabled()) {
    const worker = await loadWorkerStatusFromDb();
    for (const r of worker?.active_runs ?? []) {
      if (r.status === "running") byId.set(r.run_id, r);
    }
  }
  for (const r of listActiveRuns()) {
    if (r.status === "running") byId.set(r.run_id, r);
  }
  return [...byId.values()].map(liveRunToCatalog);
}

/** Recent agent runs with prompt/output/action summaries for the Activity overview. */
export async function listRecentActivity(limit = 30): Promise<ActivityListItem[]> {
  const live = await listLiveRunCatalogEntries();
  const seen = new Set(live.map((r) => r.run_id));
  const history = (await listRunsMerged(limit + live.length)).filter((r) => !seen.has(r.run_id));
  const merged = [...live, ...history];
  merged.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  return listToActivityItems(merged.slice(0, limit));
}

function enrichCatalogFromSidecar(entry: RunCatalogEntry): RunCatalogEntry {
  const jsonPath = entry.md_path.replace(/\.md$/, ".json");
  if (!existsSync(jsonPath)) return entry;
  try {
    const meta = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
    const input = (meta.runInput ?? meta.run_input) as AgentRunInputRecord | undefined;
    const trace = (meta.trace ?? meta.run_trace) as AgentRunTrace | undefined;
    if (input) entry.run_input = input;
    if (trace) entry.run_trace = trace;
    const status = meta.status as string | undefined;
    if (status && status !== "running" && entry.live) {
      entry.live = false;
      entry.status = status;
    }
  } catch {
    /* ignore */
  }
  return entry;
}

function readPreview(path: string, maxChars: number): string {
  try {
    const text = readFileSync(path, "utf8");
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
  } catch {
    return "";
  }
}

export async function getRunDetail(runId: string): Promise<RunCatalogEntry | null> {
  const live = await findActiveRunById(runId);
  if (live) {
    const entry = enrichCatalogFromSidecar({
      run_id: live.run_id,
      agent_id: live.agent_id,
      started_at: live.started_at,
      status: live.status,
      md_path: catalogMdPathForRunId(runId),
      reason: live.reason,
      live: true,
      pid: live.pid,
      output_preview: "_Run in progress — output file not written yet._",
    });
    // #region agent log
    fetch("http://127.0.0.1:7746/ingest/994bad2f-5ad5-4c20-9cd2-19e851fc1d5c", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "898ce1" },
      body: JSON.stringify({
        sessionId: "898ce1",
        hypothesisId: "C",
        location: "runs-catalog.ts:getRunDetail",
        message: "live run detail",
        data: {
          runId,
          agent_id: entry.agent_id,
          has_trace: Boolean(entry.run_trace),
          has_input: Boolean(entry.run_input),
          md_exists: existsSync(entry.md_path),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return entry;
  }

  if (useSupabaseStore() && dbEnabled()) {
    const row = await getRunById(runId);
    if (row) {
      const entry = historyRowToCatalog(row);
      if (row.output_md) entry.output_preview = row.output_md;
      entry.run_input = row.run_input ?? undefined;
      entry.run_trace = row.run_trace ?? undefined;
      entry.trace_events = await getRunEvents(runId);
      const rollouts = await getRolloutsForRun(runId);
      const prFromRollout = rollouts.map((r) => r.pr_url).filter((u): u is string => Boolean(u));
      if (prFromRollout.length && !entry.pr_urls?.length) entry.pr_urls = prFromRollout;
      return entry;
    }
  }

  let md: string | null = null;
  let jsonPath: string | null = null;
  for (const dir of [runsDir(), mockRunsDir()]) {
    const candidate = join(dir, `${runId}.md`);
    if (existsSync(candidate)) {
      md = candidate;
      jsonPath = join(dir, `${runId}.json`);
      break;
    }
  }
  if (!md) return null;

  let row = listRunsFromDisk(200).find((r) => r.run_id === runId);
  if (!row && isMockCatalogEntry({ run_id: runId, agent_id: "", started_at: "", status: "", md_path: md })) {
    const parsed = parseRunBasename(`${runId}.md`);
    if (parsed) {
      row = {
        run_id: runId,
        agent_id: parsed.agentId,
        started_at: isoFromTs(parsed.ts),
        status: "finished",
        backend: "mock",
        md_path: md,
        json_path: jsonPath && existsSync(jsonPath) ? jsonPath : undefined,
      };
    }
  }
  if (!row) return null;
  try {
    row.output_preview = readFileSync(md, "utf8");
  } catch {
    /* empty */
  }
  return enrichCatalogFromSidecar(row);
}

export async function listRunsForAgent(agentId: string, limit = 15): Promise<RunCatalogEntry[]> {
  let history: RunCatalogEntry[] = [];
  if (useSupabaseStore() && dbEnabled()) {
    const fromDb = await listAgentRunHistory(agentId, limit);
    history = fromDb.map(historyRowToCatalog);
  } else {
    history = filterProductionRuns(listRunsFromDisk(200).filter((r) => r.agent_id === agentId));
  }

  const live = listActiveRuns()
    .filter((r) => r.agent_id === agentId)
    .map(
      (r): RunCatalogEntry => ({
        run_id: r.run_id,
        agent_id: r.agent_id,
        started_at: r.started_at,
        status: r.status,
        md_path: catalogMdPathForRunId(r.run_id),
        reason: r.reason,
        live: true,
        pid: r.pid,
        output_preview: "_Running…_",
      }),
    );
  const seen = new Set(live.map((r) => r.run_id));
  const merged = [...live, ...history.filter((r) => !seen.has(r.run_id))];
  return merged.slice(0, limit);
}

export async function getAgentRunHistory(agentId: string, limit = 50): Promise<AgentRunHistoryRow[]> {
  if (useSupabaseStore() && dbEnabled()) {
    return listAgentRunHistory(agentId, limit);
  }
  const fromDisk = await listRunsForAgent(agentId, limit);
  return fromDisk.map(
    (r): AgentRunHistoryRow => ({
      run_id: r.run_id,
      agent_id: r.agent_id,
      started_at: r.started_at,
      status: r.status,
      backend: r.backend ?? null,
      briefing_hash: r.briefing_hash ?? null,
      reason: r.reason ?? null,
      duration_ms: r.duration_ms ?? null,
      output_md: r.output_preview ?? null,
      output_path: r.md_path,
      completion: r.completion ?? null,
      pr_urls: r.pr_urls ?? [],
      summary: r.summary ?? r.output_preview?.slice(0, 160),
      premature: r.premature,
    }),
  );
}

export async function getAgentDetail(agentId: AgentId) {
  const def = getAgent(agentId);
  if (!def) return null;

  const cpState = loadStateForApi();
  const report = readJson(reportPath()) as Record<string, unknown> | null;
  const recommended = (report?.recommended_agents as Array<{ agent: string; reason: string }>) ?? [];
  const rec = recommended.find((r) => r.agent === agentId);
  const heapPlan = report?.heap_plan as Record<string, unknown> | undefined;
  const flatTasks =
    (heapPlan?.flat_tasks as Array<{ agent: string; reason: string; coordinator: string }>) ?? [];
  const heapTask = flatTasks.find((t) => t.agent === agentId);

  const { buildAgentWorkQueue } = await import("./agent-work-queue.js");
  const workQueue = await buildAgentWorkQueue(cpState);
  const agentQueue = workQueue.by_agent[agentId] ?? [];
  const recentTasks = cpState.recent_tasks.filter((t) => t.agentId === agentId).slice(-8).reverse();
  const activeRun = listActiveRuns().find((r) => r.agent_id === agentId && r.status === "running");
  const supervisorRunning =
    cpState.supervisor_status === "running_agent" && cpState.current_supervisor_agent === agentId;
  const stopped = (cpState.stopped_agents ?? []).includes(agentId);
  const runs = await listRunsForAgent(agentId, 12);
  const history = await getAgentRunHistory(agentId, 50);

  let status: "running" | "stopped" | "recommended" | "idle" | "cooldown" = "idle";
  if (stopped) status = "stopped";
  else if (activeRun || supervisorRunning) status = "running";
  else if (recentTasks.length && recentTasks[0].status === "finished") {
    const finishedAt = new Date(recentTasks[0].finished_at).getTime();
    if (Date.now() - finishedAt < 3_600_000) status = "cooldown";
  } else if (rec || heapTask) status = "recommended";

  return {
    agent: {
      id: def.id,
      name: def.name,
      description: def.description,
      category: def.category,
      role: def.id === "orchestrator" ? "root" : "leaf",
      coordinator: coordinatorForLeaf(def.id),
      skills: def.skills,
      needsWeb: def.needsWeb,
      promptFile: def.promptFile,
    },
    status,
    stopped,
    active_run: activeRun ?? null,
    recommended_reason:
      agentQueue.find((q) => q.status === "pending")?.reason ??
      rec?.reason ??
      heapTask?.reason,
    heap_coordinator: heapTask?.coordinator,
    work_queue: agentQueue,
    recent_tasks: recentTasks,
    runs,
    history,
    briefing_hash: (report?.briefing_hash as string) ?? cpState.last_briefing_hash,
  };
}
