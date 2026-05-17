import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getAgent } from "../agents/registry.js";
import { coordinatorForLeaf } from "../heap/coordinators.js";
import { runsDir } from "./paths.js";
import { listActiveRuns } from "./runtime.js";
import { loadState } from "./state.js";
import { readJson } from "./read-json.js";
import { reportPath } from "./paths.js";
import type { AgentId } from "../types.js";

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
}

function parseRunBasename(file: string): { agentId: string; ts: number } | null {
  const m = /^(.+)-(\d+)\.(md|json)$/.exec(file);
  if (!m) return null;
  return { agentId: m[1], ts: Number(m[2]) };
}

function isoFromTs(ts: number): string {
  return new Date(ts).toISOString();
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
    });
  }

  entries.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  return entries.slice(0, limit);
}

function readPreview(path: string, maxChars: number): string {
  try {
    const text = readFileSync(path, "utf8");
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
  } catch {
    return "";
  }
}

export function getRunDetail(runId: string): RunCatalogEntry | null {
  const dir = runsDir();
  const md = join(dir, `${runId}.md`);
  if (!existsSync(md)) {
    const live = listActiveRuns().find((r) => r.run_id === runId);
    if (live) {
      return {
        run_id: live.run_id,
        agent_id: live.agent_id,
        started_at: live.started_at,
        status: live.status,
        md_path: md,
        reason: live.reason,
        live: true,
        pid: live.pid,
        output_preview: "_Run in progress — output file not written yet._",
      };
    }
    return null;
  }

  const all = listRunsFromDisk(200);
  const row = all.find((r) => r.run_id === runId);
  if (!row) return null;
  try {
    row.output_preview = readFileSync(md, "utf8");
  } catch {
    /* empty */
  }
  return row;
}

export function listRunsForAgent(agentId: string, limit = 15): RunCatalogEntry[] {
  const disk = listRunsFromDisk(200).filter((r) => r.agent_id === agentId);
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
  const merged = [...live, ...disk.filter((r) => !seen.has(r.run_id))];
  return merged.slice(0, limit);
}

export function getAgentDetail(agentId: AgentId) {
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
  const stopped = (cpState.stopped_agents ?? []).includes(agentId);
  const runs = listRunsForAgent(agentId, 12);

  let status: "running" | "stopped" | "queued" | "idle" | "cooldown" = "idle";
  if (stopped) status = "stopped";
  else if (activeRun) status = "running";
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
    briefing_hash: (report?.briefing_hash as string) ?? cpState.last_briefing_hash,
  };
}
