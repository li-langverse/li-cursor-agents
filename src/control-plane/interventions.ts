import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getAgent } from "../agents/registry.js";
import { resolveCursorApiKey } from "../env.js";
import type { AgentId } from "../types.js";
import type { HumanIntervention, InterventionKind, InterventionSeverity } from "./types.js";

function id(kind: string, suffix: string): string {
  return `${kind}:${suffix}`;
}

function item(
  kind: InterventionKind,
  severity: InterventionSeverity,
  title: string,
  detail: string,
  action: string,
  links: string[] = [],
): HumanIntervention {
  return {
    id: id(kind, title.slice(0, 48).replace(/\s+/g, "-").toLowerCase()),
    kind,
    severity,
    title,
    detail,
    action,
    links,
    created_at: new Date().toISOString(),
  };
}

export function scanInterventions(
  briefing: unknown,
  options: { coordPath?: string; pendingWebAgents?: AgentId[] },
): HumanIntervention[] {
  const out: HumanIntervention[] = [];
  if (!briefing || typeof briefing !== "object") return out;
  const b = briefing as Record<string, unknown>;

  out.push(...preflightFailures(b));
  out.push(...mergeInterventions(b));
  out.push(...needsPlan(b));
  out.push(...redBenchmarks(b));
  out.push(...coordinationConflicts(options.coordPath));

  if (!resolveCursorApiKey() && (options.pendingWebAgents?.length ?? 0) > 0) {
    out.push(
      item(
        "api_key_missing",
        "high",
        "Cursor API key missing for web agents",
        `Agents pending: ${options.pendingWebAgents!.join(", ")}`,
        "Set CURSOR_API_KEY in .env or environment, or run with CURSOR_MOCK=1 for dry runs only.",
      ),
    );
  }

  return dedupeInterventions(out);
}

function preflightFailures(b: Record<string, unknown>): HumanIntervention[] {
  const runs = b.preflight_runs as Record<string, { exit_code?: number; skipped?: boolean }> | undefined;
  if (!runs) return [];
  const failed = Object.entries(runs).filter(([, v]) => v && !v.skipped && (v.exit_code ?? 0) !== 0);
  return failed.map(([name]) =>
    item(
      "preflight_failed",
      "high",
      `Preflight script failed: ${name}`,
      `Exit code non-zero for ${name}. Agents may act on stale JSON.`,
      `Fix ${name} script locally, then re-run ./scripts/agent-preflight.sh in benchmarks.`,
    ),
  );
}

function mergeInterventions(b: Record<string, unknown>): HumanIntervention[] {
  const pr = b.pr_program as Record<string, unknown> | undefined;
  const rows = (pr?.all_open ?? []) as Array<Record<string, unknown>>;
  const out: HumanIntervention[] = [];

  for (const row of rows) {
    if (!row.merge_approved) continue;
    const repo = String(row.repo ?? "");
    const num = row.number;
    const url = String(row.url ?? "");
    const blockers = (row.gate_blockers_if_approved ?? []) as string[];
    const governance = blockers.some((x) => String(x).includes("governance_repo"));

    if (governance) {
      out.push(
        item(
          "governance_merge",
          "critical",
          `Human merge required: ${repo}#${num}`,
          blockers.join("; "),
          "Merge this PR yourself (roadmap/governance). Agents must not merge.",
          url ? [url] : [],
        ),
      );
      continue;
    }

    if (row.gate_ready_with_approval === true) {
      out.push(
        item(
          "human_merge",
          "high",
          `Ready to merge: ${repo}#${num}`,
          String(row.title ?? ""),
          "Review diff, confirm CI, merge via GitHub UI (agents do not self-merge).",
          url ? [url] : [],
        ),
      );
    } else if (blockers.length > 0) {
      out.push(
        item(
          "human_merge",
          "medium",
          `merge-approved but blocked: ${repo}#${num}`,
          blockers.join("; "),
          "Resolve blockers or remove merge-approved label.",
          url ? [url] : [],
        ),
      );
    }
  }

  const summary = (pr?.summary ?? {}) as Record<string, number>;
  if ((summary.merge_approved ?? 0) > 0 && out.length === 0) {
    out.push(
      item(
        "human_merge",
        "medium",
        `${summary.merge_approved} PR(s) with merge-approved label`,
        "See pr-program-run.json for details.",
        "Review PR queue in dashboard links.",
      ),
    );
  }

  return out;
}

function needsPlan(b: Record<string, unknown>): HumanIntervention[] {
  const triage = b.issue_triage as Record<string, unknown> | undefined;
  const count =
    (triage?.summary as Record<string, number> | undefined)?.needs_plan ?? triage?.needs_plan;
  const n = typeof count === "number" ? count : 0;
  if (n <= 0) return [];
  return [
    item(
      "needs_plan",
      "medium",
      `${n} issue(s) need a plan before implementation`,
      "Issues labeled or triaged as plan-needed.",
      "Run issue-feature-planner agent or write plan docs; approve scope before coding.",
    ),
  ];
}

function redBenchmarks(b: Record<string, unknown>): HumanIntervention[] {
  const audit = b.ecosystem_audit as Record<string, unknown> | undefined;
  const bench = audit?.benchmarks as Record<string, unknown> | undefined;
  const raw = bench?.red;
  const rows = Array.isArray(raw) ? raw : [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) =>
    typeof r === "string" ? r : String((r as { id?: string }).id ?? "unknown"),
  );
  return [
    item(
      "ci_red",
      "medium",
      `${rows.length} red benchmark row(s)`,
      ids.slice(0, 6).join(", ") + (ids.length > 6 ? "…" : ""),
      "Prioritize compiler/bench fix or run numerics_research agent after reviewing dashboard.",
      ["https://li-langverse.github.io/benchmarks/"],
    ),
  ];
}

function coordinationConflicts(coordPath?: string): HumanIntervention[] {
  if (!coordPath || !existsSync(coordPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(coordPath, "utf8")) as Record<string, unknown>;
    const claims = (raw.claims ?? []) as Array<Record<string, unknown>>;
    const workers = (raw.workers ?? []) as Array<Record<string, unknown>>;
    const active = workers.filter((w) => w.status === "in_progress");
    const out: HumanIntervention[] = [];
    if (claims.length > 0) {
      out.push(
        item(
          "coordination_conflict",
          "medium",
          `${claims.length} active path claim(s) in .li-agent-coord.json`,
          claims.map((c) => `${c.repo}:${(c.paths as string[])?.join(",")}`).join("; "),
          "Avoid editing claimed paths; coordinate with other agents or clear stale claims.",
        ),
      );
    }
    if (active.length > 1) {
      out.push(
        item(
          "coordination_conflict",
          "low",
          `${active.length} workers in_progress`,
          active.map((w) => String(w.id)).join(", "),
          "Confirm workers are not duplicating work.",
        ),
      );
    }
    return out;
  } catch {
    return [];
  }
}

function dedupeInterventions(list: HumanIntervention[]): HumanIntervention[] {
  const seen = new Set<string>();
  const out: HumanIntervention[] = [];
  for (const i of list) {
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    out.push(i);
  }
  const rank: Record<InterventionSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function defaultCoordPath(): string {
  return process.env.LI_AGENT_COORD_PATH ?? join(process.cwd(), "..", ".li-agent-coord.json");
}

export function agentNeedsWeb(agentId: AgentId): boolean {
  return getAgent(agentId)?.needsWeb ?? false;
}
