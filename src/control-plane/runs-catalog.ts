import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getAgent } from "../agents/registry.js";
import { coordinatorForLeaf } from "../heap/coordinators.js";
import { runsDir } from "./paths.js";
import { listActiveRuns } from "./runtime.js";
import { loadState } from "./state.js";
import { readJson } from "./read-json.js";
import { reportPath } from "./paths.js";
import { dbEnabled, useDiskStore, useSupabaseStore } from "../db/client.js";
import {
  getRunById,
  getRunEvents,
  getRolloutsForRun,
  listAgentRunHistory,
  listRunsGlobal,
  type AgentRunHistoryRow,
} from "../db/runs.js";
import type { AgentRunInputRecord, AgentRunTrace } from "../agent-run-trace.js";
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
  };
}

export function listRunsFromDisk(limit = 80): RunCatalogEntry[] {
  const dir = runsDir();
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }

  const entries: RunCatalogEntry[] = [];
  for (const md of files) {
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
  return entries.slice(0, limit);
}

export async function listRunsMerged(limit = 80): Promise<RunCatalogEntry[]> {
  if (useSupabaseStore()) {
    if (!dbEnabled()) return [];
    const fromDb = await listRunsGlobal(limit);
    return fromDb.map(historyRowToCatalog);
  }
  return listRunsFromDisk(limit);
}

/** Recent agent runs with prompt/output/action summaries for the Activity overview. */
export async function listRecentActivity(limit = 30): Promise<ActivityListItem[]> {
  const runs = await listRunsMerged(limit);
  return listToActivityItems(runs);
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
  const live = listActiveRuns().find((r) => r.run_id === runId);
  if (live) {
    return {
      run_id: live.run_id,
      agent_id: live.agent_id,
      started_at: live.started_at,
      status: live.status,
      md_path: join(runsDir(), `${runId}.md`),
      reason: live.reason,
      live: true,
      pid: live.pid,
      output_preview: "_Run in progress — output file not written yet._",
    };
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
    return null;
  }

  const dir = runsDir();
  const md = join(dir, `${runId}.md`);
  const jsonPath = join(dir, `${runId}.json`);
  if (!existsSync(md)) return null;

  const all = listRunsFromDisk(200);
  const row = all.find((r) => r.run_id === runId);
  if (!row) return null;
  try {
    row.output_preview = readFileSync(md, "utf8");
  } catch {
    /* empty */
  }
  if (existsSync(jsonPath)) {
    try {
      const meta = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
      row.run_input = meta.runInput as AgentRunInputRecord | undefined;
      row.run_trace = meta.trace as AgentRunTrace | undefined;
    } catch {
      /* ignore */
    }
  }
  return row;
}

export async function listRunsForAgent(agentId: string, limit = 15): Promise<RunCatalogEntry[]> {
  let history: RunCatalogEntry[] = [];
  if (useSupabaseStore() && dbEnabled()) {
    const fromDb = await listAgentRunHistory(agentId, limit);
    history = fromDb.map(historyRowToCatalog);
  } else {
    history = listRunsFromDisk(200).filter((r) => r.agent_id === agentId);
  }

  const live = listActiveRuns()
    .filter((r) => r.agent_id === agentId)
    .map(
      (r): RunCatalogEntry => ({
        run_id: r.run_id,
        agent_id: r.agent_id,
        started_at: r.started_at,
        status: r.status,
        md_path: join(runsDir(), `${r.run_id}.md`),
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

  const cpState = loadState();
  const report = readJson(reportPath()) as Record<string, unknown> | null;
  const recommended = (report?.recommended_agents as Array<{ agent: string; reason: string }>) ?? [];
  const rec = recommended.find((r) => r.agent === agentId);
  const heapPlan = report?.heap_plan as Record<string, unknown> | undefined;
  const flatTasks =
    (heapPlan?.flat_tasks as Array<{ agent: string; reason: string; coordinator: string }>) ?? [];
  const heapTask = flatTasks.find((t) => t.agent === agentId);
  const recentTasks = cpState.recent_tasks.filter((t) => t.agentId === agentId).slice(-8).reverse();
  const activeRun = listActiveRuns().find((r) => r.agent_id === agentId && r.status === "running");
  const supervisorRunning =
    cpState.supervisor_status === "running_agent" && cpState.current_supervisor_agent === agentId;
  const stopped = (cpState.stopped_agents ?? []).includes(agentId);
  const runs = await listRunsForAgent(agentId, 12);
  const history = await getAgentRunHistory(agentId, 50);

  let status: "running" | "stopped" | "queued" | "idle" | "cooldown" = "idle";
  if (stopped) status = "stopped";
  else if (activeRun || supervisorRunning) status = "running";
  else if (rec || heapTask) status = "queued";
  else if (recentTasks.length && recentTasks[0].status === "finished") {
    const finishedAt = new Date(recentTasks[0].finished_at).getTime();
    if (Date.now() - finishedAt < 3_600_000) status = "cooldown";
  }

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
    recommended_reason: rec?.reason ?? heapTask?.reason,
    heap_coordinator: heapTask?.coordinator,
    recent_tasks: recentTasks,
    runs,
    history,
    briefing_hash: (report?.briefing_hash as string) ?? cpState.last_briefing_hash,
  };
}
