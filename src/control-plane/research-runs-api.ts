import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRunInputRecord, AgentRunTrace } from "../agent-run-trace.js";
import type { AgentRunHistoryRow } from "../db/runs.js";
import { getRunById, getRunEvents } from "../db/runs.js";
import { dataStoreLabel, dbEnabled } from "../db/client.js";
import { loadResearchGoals } from "../research-goals/load-goals.js";
import {
  DEFAULT_PUBLISH_REPO,
  DEFAULT_WHITEPAPER_ROOT,
  getVerticalSpec,
  publishSubdirForGoalId,
  whitepaperPathForGoal,
} from "../research-goals/researcher-factory.js";
import type { AgentId } from "../types.js";
import { getRunDetail, listRunsMerged, type RunCatalogEntry } from "./runs-catalog.js";
import { runsDir } from "./paths.js";

/** Research agents shown on the Researchers dashboard tab. */
export const RESEARCH_DASHBOARD_AGENT_IDS: readonly AgentId[] = [
  "numerics_researcher",
  "goal_researcher",
  "gap_explorer",
  "autoresearch",
  "proof_gap_researcher",
  "stdlib_researcher",
] as const;

const RESEARCH_AGENT_SET = new Set<string>(RESEARCH_DASHBOARD_AGENT_IDS);

export interface ResearchRunListItem {
  run_id: string;
  agent_id: string;
  vertical: string | null;
  vertical_label: string | null;
  goal_id: string | null;
  goal_title: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  summary: string;
  error?: string | null;
  error_category?: string | null;
  publish_subdir?: string | null;
}

export interface ResearchRunDetail extends ResearchRunListItem {
  output_path: string | null;
  whitepaper_path: string | null;
  research_findings_repo: string;
  research_findings_path: string | null;
  goal: {
    id: string;
    title: string;
    vertical?: string;
    publish_subdir?: string;
    publish_repo?: string;
  } | null;
  trace_preview: string;
  markdown_snippet: string | null;
  events: Array<{ seq: number; event_type: string; payload: unknown; created_at?: string }>;
  run_trace?: AgentRunTrace;
  run_input?: AgentRunInputRecord;
  live?: boolean;
}

function researchMetaFromInput(input?: AgentRunInputRecord | null): {
  goal_id: string | null;
  vertical: string | null;
  publish_subdir: string | null;
} {
  return {
    goal_id: input?.research_goal_id ?? null,
    vertical: input?.research_vertical ?? null,
    publish_subdir: input?.publish_subdir ?? null,
  };
}

function goalTitle(goalId: string | null, vertical: string | null): string | null {
  if (!goalId && !vertical) return null;
  if (goalId) {
    const goal = loadResearchGoals().find((g) => g.id === goalId);
    if (goal?.title) return goal.title;
  }
  if (vertical) {
    const spec = getVerticalSpec(vertical);
    if (spec?.title) return spec.title;
    return vertical;
  }
  return goalId;
}

function verticalLabel(vertical: string | null, goalId: string | null): string | null {
  if (vertical) {
    const spec = getVerticalSpec(vertical);
    return spec?.title ?? vertical;
  }
  if (goalId) {
    const goal = loadResearchGoals().find((g) => g.id === goalId);
    return goal?.vertical ? (getVerticalSpec(goal.vertical)?.title ?? goal.vertical) : null;
  }
  return null;
}

export function researchErrorCategory(error: string | null | undefined): string | null {
  const err = (error ?? "").trim();
  if (!err) return null;
  if (err === "stale_running_reconciled") return "stale_running_reconciled";
  if (err.includes("sdk-session.lock")) return "sdk_slot_timeout";
  return err.length > 120 ? `${err.slice(0, 120)}…` : err;
}

function firstHeadingFromMd(text: string): string | null {
  const line = text.split(/\r?\n/).find((l) => /^#{1,3}\s+\S/.test(l));
  if (!line) return null;
  return line.replace(/^#+\s+/, "").trim();
}

function summaryFromTrace(trace?: AgentRunTrace | null): string {
  const assistant = trace?.assistant_text?.replace(/\s+/g, " ").trim();
  if (assistant) {
    const parts = assistant.split(/(?<=[.!?])\s+/).filter((p) => p.length > 12);
    const tail = parts.slice(-3).join(" ");
    return tail.length > 480 ? `${tail.slice(0, 477)}…` : tail;
  }
  const deltas = trace?.deltas ?? [];
  for (let i = deltas.length - 1; i >= 0; i--) {
    const d = deltas[i]!;
    const type = String(d.type ?? "").toLowerCase();
    if (type.includes("token") || type.includes("thinking")) continue;
    const payload = d.payload as Record<string, unknown> | undefined;
    const text =
      (typeof payload?.text === "string" && payload.text) ||
      (typeof payload?.message === "string" && payload.message) ||
      "";
    if (text.trim()) {
      const flat = text.replace(/\s+/g, " ").trim();
      return flat.length > 480 ? `${flat.slice(0, 477)}…` : flat;
    }
  }
  return "";
}

function readMarkdownForRun(runId: string, outputPath?: string | null): string {
  const candidates = [
    outputPath,
    join(runsDir(), `${runId}.md`),
  ].filter((p): p is string => Boolean(p));
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      return readFileSync(path, "utf8");
    } catch {
      /* try next */
    }
  }
  return "";
}

/** Derive a 1–3 sentence summary at read time (no DB column required). */
export function deriveResearchRunSummary(
  row: Pick<
    AgentRunHistoryRow,
    "status" | "error" | "summary" | "output_md" | "output_path" | "run_trace" | "run_input"
  > & { run_id?: string },
): string {
  if (row.status === "error") {
    const cat = researchErrorCategory(row.error);
    return cat ? `Error: ${cat}` : "Run failed (no error message)";
  }

  const mdRaw =
    row.output_md ??
    (row.run_id ? readMarkdownForRun(row.run_id, row.output_path) : "");
  if (mdRaw) {
    const heading = firstHeadingFromMd(mdRaw);
    if (heading) return heading;
  }

  const fromOutput = (row.summary ?? mdRaw ?? "").replace(/\s+/g, " ").trim();
  if (fromOutput && fromOutput.length >= 24) {
    return fromOutput.length > 480 ? `${fromOutput.slice(0, 477)}…` : fromOutput;
  }

  const fromTrace = summaryFromTrace(row.run_trace ?? undefined);
  if (fromTrace) return fromTrace;

  if (mdRaw) {
    const flat = mdRaw.replace(/\s+/g, " ").trim();
    if (flat) return flat.length > 500 ? `${flat.slice(0, 497)}…` : flat;
  }

  const goalId = row.run_input?.research_goal_id;
  if (goalId) {
    const title = goalTitle(goalId, row.run_input?.research_vertical ?? null);
    if (title) return `Research run for ${title}.`;
  }

  if (row.status === "running") return "Research run in progress.";
  return "Research run completed (no summary captured).";
}

function resolvePublishSubdir(
  input: AgentRunInputRecord | null | undefined,
  goalId: string | null,
): string | null {
  if (input?.publish_subdir) return input.publish_subdir;
  if (goalId) return publishSubdirForGoalId(goalId);
  return null;
}

function summarySourceFromCatalog(entry: RunCatalogEntry): Parameters<typeof deriveResearchRunSummary>[0] {
  return {
    run_id: entry.run_id,
    status: entry.live ? "running" : entry.status,
    error: entry.error ?? null,
    summary: entry.summary,
    output_md: entry.output_preview ?? null,
    output_path: entry.md_path ?? null,
    run_trace: entry.run_trace ?? null,
    run_input: entry.run_input ?? null,
  };
}

function listItemFromCatalog(
  entry: RunCatalogEntry,
  finishedAt: string | null = null,
): ResearchRunListItem {
  const meta = researchMetaFromInput(entry.run_input);
  const goalId = meta.goal_id;
  const vertical = meta.vertical;
  const publishSubdir = resolvePublishSubdir(entry.run_input ?? undefined, goalId);
  const status = entry.live ? "running" : entry.status;
  const item: ResearchRunListItem = {
    run_id: entry.run_id,
    agent_id: entry.agent_id,
    vertical,
    vertical_label: verticalLabel(vertical, goalId),
    goal_id: goalId,
    goal_title: goalTitle(goalId, vertical),
    status,
    started_at: entry.started_at,
    finished_at: finishedAt,
    summary: deriveResearchRunSummary(summarySourceFromCatalog(entry)),
    publish_subdir: publishSubdir,
  };
  if (status === "error") {
    item.error = entry.error ?? null;
    item.error_category = researchErrorCategory(entry.error);
  }
  return item;
}

export async function listResearchRuns(limit = 50): Promise<{
  runs: ResearchRunListItem[];
  store: string;
  agent_ids: readonly AgentId[];
}> {
  const capped = Math.min(100, Math.max(1, limit));
  const scanLimit = Math.min(500, capped * 8);
  const merged = (await listRunsMerged(scanLimit)).filter((r) => RESEARCH_AGENT_SET.has(r.agent_id));
  const runs = merged.slice(0, capped).map((entry) => listItemFromCatalog(entry, null));
  return {
    runs,
    store: dataStoreLabel(),
    agent_ids: RESEARCH_DASHBOARD_AGENT_IDS,
  };
}

export async function getResearchRunDetail(runId: string): Promise<ResearchRunDetail | null> {
  const detail = await getRunDetail(runId);
  if (!detail || !RESEARCH_AGENT_SET.has(detail.agent_id)) return null;

  const dbRow = await getRunById(runId);
  const base = listItemFromCatalog(detail, detail.live ? null : (dbRow?.finished_at ?? null));
  const meta = researchMetaFromInput(detail.run_input);
  const goalId = meta.goal_id;
  const publishSubdir = resolvePublishSubdir(detail.run_input, goalId);
  const whitepaperPath = goalId
    ? whitepaperPathForGoal(goalId)
    : publishSubdir
      ? `${DEFAULT_WHITEPAPER_ROOT}/${publishSubdir}/`
      : null;

  const mdFull = readMarkdownForRun(runId, detail.md_path);
  const markdownSnippet = mdFull
    ? mdFull.length > 4000
      ? `${mdFull.slice(0, 4000)}…`
      : mdFull
    : null;

  const tracePreview =
    summaryFromTrace(detail.run_trace) ||
    detail.run_trace?.assistant_text?.slice(0, 2000) ||
    detail.output_preview?.slice(0, 2000) ||
    "";

  let events = detail.trace_events ?? [];
  if (!events.length && dbEnabled()) {
    events = await getRunEvents(runId, 80);
  }

  const goalFromYaml = goalId ? loadResearchGoals().find((g) => g.id === goalId) : undefined;

  return {
    ...base,
    status: detail.live ? "running" : detail.status,
    output_path: detail.md_path ?? null,
    whitepaper_path: whitepaperPath,
    research_findings_repo: goalFromYaml?.publish_repo ?? DEFAULT_PUBLISH_REPO,
    research_findings_path: publishSubdir
      ? `whitepapers/${publishSubdir}/`
      : null,
    goal: goalId
      ? {
          id: goalId,
          title: goalTitle(goalId, meta.vertical) ?? goalId,
          vertical: meta.vertical ?? goalFromYaml?.vertical,
          publish_subdir: publishSubdir ?? undefined,
          publish_repo: goalFromYaml?.publish_repo ?? DEFAULT_PUBLISH_REPO,
        }
      : null,
    trace_preview: tracePreview,
    markdown_snippet: markdownSnippet,
    events,
    run_trace: detail.run_trace,
    run_input: detail.run_input,
    live: detail.live,
  };
}
