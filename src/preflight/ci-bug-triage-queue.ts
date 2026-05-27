/** Resolve ci_bug_triage / briefing queues for swarm-scoped bug_fixer dispatch. */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveBenchmarksRoot } from "../preflight.js";
import type { WorkQueueItem } from "./implementation-queue.js";

export const SWARM_CI_BUG_QUEUE_CAP = 5;

export type CiBugTriageRow = WorkQueueItem & {
  originating_agent_id?: string;
  goal_id?: string;
  is_agent_pr?: boolean;
};

/** Default on: only swarm_work_queue drives control-plane bug_fixer work unless disabled. */
export function bugFixerSwarmOnly(): boolean {
  const v = process.env.LI_BUG_FIXER_SWARM_ONLY?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

function asRows(raw: unknown): CiBugTriageRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r === "object") as CiBugTriageRow[];
}

export function ciBugTriageFromBriefing(briefing: unknown): Record<string, unknown> | undefined {
  if (!briefing || typeof briefing !== "object") return undefined;
  const triage = (briefing as Record<string, unknown>).ci_bug_triage;
  return triage && typeof triage === "object" ? (triage as Record<string, unknown>) : undefined;
}

export function resolveCiBugTriageQueues(triage: Record<string, unknown> | undefined): {
  swarm: CiBugTriageRow[];
  org: CiBugTriageRow[];
  fallback: CiBugTriageRow[];
} {
  if (!triage) return { swarm: [], org: [], fallback: [] };
  const swarm = asRows(triage.swarm_work_queue);
  const org = asRows(triage.org_work_queue);
  const fallback = asRows(triage.work_queue);
  return { swarm, org, fallback };
}

/** Rows for bug_fixer work queue / prompts (swarm-first when LI_BUG_FIXER_SWARM_ONLY). */
export function selectBugFixerCiQueueRows(triage: Record<string, unknown> | undefined): {
  rows: CiBugTriageRow[];
  source: string;
} {
  const { swarm, org, fallback } = resolveCiBugTriageQueues(triage);
  if (bugFixerSwarmOnly()) {
    if (swarm.length) {
      return { rows: swarm.slice(0, SWARM_CI_BUG_QUEUE_CAP), source: "ci_bug_triage.swarm_work_queue" };
    }
    return { rows: fallback.slice(0, 8), source: "ci_bug_triage.work_queue" };
  }
  const combined = [...swarm, ...org, ...fallback];
  if (combined.length) {
    return { rows: combined.slice(0, 8), source: "ci_bug_triage" };
  }
  return { rows: [], source: "ci_bug_triage" };
}

function parsePrUrl(url: string): { repo?: string; number?: number } {
  const m = url.match(/github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/i);
  if (!m) return {};
  return { repo: m[1], number: Number(m[2]) };
}

function localCiFailedForPr(repo: string, number: number): boolean {
  const root = resolveBenchmarksRoot();
  if (!root) return false;
  const path = join(root, "data", "latest", "local-ci-results.json");
  if (!existsSync(path)) return false;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    for (const row of (data.runs ?? []) as Array<Record<string, unknown>>) {
      if (row.ok) continue;
      if (String(row.repo ?? "") === repo && Number(row.number ?? 0) === number) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function prProgramCiRed(briefing: Record<string, unknown>, repo: string, number: number): boolean {
  const pr = briefing.pr_program as Record<string, unknown> | undefined;
  const rows = (pr?.all_open ?? []) as Array<Record<string, unknown>>;
  const row = rows.find((r) => String(r.repo ?? "") === repo && Number(r.number ?? 0) === number);
  if (!row) return false;
  const ci = String(row.ci ?? "").toLowerCase();
  return ci === "fail" || ci === "failure" || ci === "red" || ci === "error";
}

/** Briefing signals swarm/agent PRs with failing CI (distinct from red benchmarks). */
export function briefingHasSwarmPrCiRed(briefing: unknown): boolean {
  if (!briefing || typeof briefing !== "object") return false;
  const b = briefing as Record<string, unknown>;

  const triage = ciBugTriageFromBriefing(b);
  const { swarm } = resolveCiBugTriageQueues(triage);
  if (swarm.length > 0) return true;

  const gateFailures = b.agent_pr_deliverable_failures;
  if (Array.isArray(gateFailures) && gateFailures.length > 0) return true;

  const audit = b.ecosystem_audit as Record<string, unknown> | undefined;
  const failed = audit?.failed_prs;
  if (Array.isArray(failed)) {
    const agentLike = failed.filter(
      (r) => r && typeof r === "object" && isLikelyAgentPr(r as Record<string, unknown>),
    );
    if (agentLike.length > 0) return true;
  }

  const gaps = b.agent_deliverable_gaps as Record<string, unknown> | undefined;
  if (Number(gaps?.agent_prs_blocked ?? 0) > 0) return true;

  return false;
}

/** After implement-lane opens/updates a PR, enqueue bug_fixer when local-ci or GHA is known red. */
export function implementPrNeedsCiFix(
  briefing: unknown,
  prUrl: string | undefined,
): { needsFix: boolean; repo?: string; number?: number } {
  if (!prUrl) return { needsFix: false };
  const parsed = parsePrUrl(prUrl);
  if (!parsed.repo || !parsed.number) return { needsFix: false };

  if (localCiFailedForPr(parsed.repo, parsed.number)) {
    return { needsFix: true, ...parsed };
  }
  if (briefing && typeof briefing === "object") {
    if (prProgramCiRed(briefing as Record<string, unknown>, parsed.repo, parsed.number)) {
      return { needsFix: true, ...parsed };
    }
  }
  return { needsFix: false, ...parsed };
}

function isLikelyAgentPr(row: Record<string, unknown>): boolean {
  if (row.is_agent_pr === true) return true;
  const title = String(row.title ?? "");
  const head = String(row.head ?? row.headRefName ?? row.branch ?? "");
  if (/chore\(agent|feat\(agent|fix\(agent|cursor\//i.test(title)) return true;
  if (head.startsWith("cursor/") || /^chore\/agent-/i.test(head)) return true;
  return String(row.source ?? "").includes("agent");
}

export function buildBugFixerSwarmGoalContextBlock(rows: CiBugTriageRow[]): string {
  const withContext = rows.filter((r) => r.originating_agent_id || r.goal_id);
  if (!withContext.length) return "";

  const lines = [
    "## Swarm CI context (current queue)",
    "",
    "| Repo | PR | Originating agent | Goal |",
    "|------|---:|-------------------|------|",
  ];
  for (const r of withContext.slice(0, SWARM_CI_BUG_QUEUE_CAP)) {
    lines.push(
      `| ${r.repo ?? "—"} | ${r.number ?? "—"} | ${r.originating_agent_id ?? "—"} | ${r.goal_id ?? "—"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
