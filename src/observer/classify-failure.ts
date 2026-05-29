import type { AgentRunResult } from "../types.js";

export type RunFailureClass =
  | "sdk_auth"
  | "preflight_script"
  | "repo_dirty"
  | "git_conflict"
  | "unknown";

export interface ClassifiedRunFailure {
  class: RunFailureClass;
  /** Short evidence substring for dashboards. */
  hint: string;
}

const SDK_PATTERNS = [
  "api key",
  "unauthorized",
  "authentication",
  "cursor_api",
  "401",
  "403 forbidden",
];

const PREFLIGHT_PATTERNS = [
  "agent-briefing",
  "preflight",
  "attributeerror",
  "nonetype",
  "agent-preflight",
];

const DIRTY_PATTERNS = [
  "uncommitted",
  "dirty working tree",
  "would be overwritten",
  "local changes",
  "please commit",
];

const GIT_CONFLICT_PATTERNS = [
  "merge conflict",
  "conflict in",
  "rejected",
  "non-fast-forward",
  "failed to push",
];

function blob(run: AgentRunResult): string {
  return `${run.error ?? ""} ${run.outputText ?? ""}`.toLowerCase();
}

export function classifyRunFailure(run: AgentRunResult): ClassifiedRunFailure | undefined {
  if (run.status !== "error") return undefined;
  const text = blob(run);
  if (!text.trim()) return { class: "unknown", hint: "empty error output" };

  if (SDK_PATTERNS.some((p) => text.includes(p))) {
    return { class: "sdk_auth", hint: "SDK / API authentication" };
  }
  if (GIT_CONFLICT_PATTERNS.some((p) => text.includes(p))) {
    return { class: "git_conflict", hint: "git merge / push conflict" };
  }
  if (DIRTY_PATTERNS.some((p) => text.includes(p))) {
    return { class: "repo_dirty", hint: "uncommitted or dirty workspace" };
  }
  if (PREFLIGHT_PATTERNS.some((p) => text.includes(p))) {
    return { class: "preflight_script", hint: "briefing / preflight script failure" };
  }
  return { class: "unknown", hint: text.slice(0, 80) };
}

export function briefingPreflightFailed(briefing: unknown): boolean {
  if (!briefing || typeof briefing !== "object") return false;
  const runs = (briefing as Record<string, unknown>).preflight_runs;
  if (!runs || typeof runs !== "object") return false;
  for (const row of Object.values(runs as Record<string, unknown>)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (r.skipped === true) continue;
    const code = r.exit_code;
    if (typeof code === "number" && code !== 0) return true;
  }
  return false;
}

export function briefingStaleMs(briefing: unknown, nowMs = Date.now()): number | undefined {
  if (!briefing || typeof briefing !== "object") return undefined;
  const generated = (briefing as Record<string, unknown>).generated_at;
  if (typeof generated !== "string" || !generated.trim()) return undefined;
  const at = Date.parse(generated);
  if (!at || Number.isNaN(at)) return undefined;
  return nowMs - at;
}

export function isBriefingStale(briefing: unknown, nowMs = Date.now()): boolean {
  const age = briefingStaleMs(briefing, nowMs);
  if (age === undefined) return false;
  const maxMs = Number(process.env.LI_OBSERVER_BRIEFING_STALE_MS ?? 6 * 60 * 60_000);
  return age > maxMs;
}

export function briefingWorkspaceDirty(briefing: unknown): boolean {
  if (!briefing || typeof briefing !== "object") return false;
  const sweep = (briefing as Record<string, unknown>).workspace_dirty_sweep as
    | Record<string, unknown>
    | undefined;
  if (!sweep) return false;
  const count = sweep.dirty_count;
  if (typeof count === "number" && count > 0) return true;
  const repos = sweep.dirty_repos ?? sweep.repos_needing_sweep;
  return Array.isArray(repos) && repos.length > 0;
}

export function briefingHandoffsBacklogged(briefing: unknown): boolean {
  if (!briefing || typeof briefing !== "object") return false;
  const audit = (briefing as Record<string, unknown>).handoff_audit as
    | Record<string, unknown>
    | undefined;
  const open = audit?.open_handoffs;
  const threshold = Number(process.env.LI_OBSERVER_HANDOFF_BACKLOG_THRESHOLD ?? 4);
  return typeof open === "number" && open >= threshold;
}
