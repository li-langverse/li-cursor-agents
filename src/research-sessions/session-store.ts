import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../package-root.js";
import { dbEnabled, getSupabase } from "../db/client.js";
import { withSupabaseRetry } from "../db/supabase-retry.js";

const SESSION_COLUMNS =
  "session_id, agent_id, goal_id, cycle, status, current_focus, queue, hypotheses, completed_steps, artifacts, connections, deferred_findings, last_run_id, last_run_status, created_at, updated_at";
import type {
  CompletedStep,
  ResearchFocus,
  ResearchHypothesis,
  ResearchSession,
  ResearchSessionStatus,
} from "./types.js";

const SESSIONS_DIR = () =>
  process.env.LI_RESEARCH_SESSIONS_DIR?.trim() ||
  join(agentsPackageRoot(), "data", "research-sessions");

function nowIso(): string {
  return new Date().toISOString();
}

function sessionPath(agentId: string): string {
  return join(SESSIONS_DIR(), `${agentId}.json`);
}

function rowToSession(row: Record<string, unknown>): ResearchSession {
  return {
    session_id: String(row.session_id),
    agent_id: String(row.agent_id),
    goal_id: row.goal_id as string | undefined,
    cycle: Number(row.cycle ?? 1),
    status: row.status as ResearchSessionStatus,
    current_focus: (row.current_focus as ResearchFocus | null) ?? null,
    queue: (row.queue as ResearchFocus[]) ?? [],
    hypotheses: (row.hypotheses as ResearchHypothesis[]) ?? [],
    completed_steps: (row.completed_steps as CompletedStep[]) ?? [],
    artifacts: row.artifacts as Record<string, string> | undefined,
    connections: (row.connections as ResearchSession["connections"]) ?? [],
    deferred_findings: (row.deferred_findings as string[]) ?? [],
    last_run_id: row.last_run_id as string | null | undefined,
    last_run_status: row.last_run_status as string | null | undefined,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function sessionToRow(s: ResearchSession): Record<string, unknown> {
  return {
    session_id: s.session_id,
    agent_id: s.agent_id,
    goal_id: s.goal_id ?? null,
    cycle: s.cycle,
    status: s.status,
    current_focus: s.current_focus,
    queue: s.queue,
    hypotheses: s.hypotheses ?? [],
    completed_steps: s.completed_steps,
    artifacts: s.artifacts ?? null,
    connections: s.connections,
    deferred_findings: s.deferred_findings,
    last_run_id: s.last_run_id ?? null,
    last_run_status: s.last_run_status ?? null,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

function readDiskSession(agentId: string): ResearchSession | null {
  try {
    const raw = readFileSync(sessionPath(agentId), "utf8");
    return rowToSession(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

function writeDiskSession(session: ResearchSession): void {
  mkdirSync(SESSIONS_DIR(), { recursive: true });
  writeFileSync(sessionPath(session.agent_id), `${JSON.stringify(sessionToRow(session), null, 2)}\n`, "utf8");
}

/** One indexed query for full queue build (replaces N+1 loadResearchSession per goal). */
export async function listInProgressResearchSessions(): Promise<ResearchSession[]> {
  if (!dbEnabled()) {
    return [];
  }
  return withSupabaseRetry("listInProgressResearchSessions", async () => {
    const { data, error } = await getSupabase()
      .from("research_sessions")
      .select(SESSION_COLUMNS)
      .eq("status", "in_progress")
      .order("updated_at", { ascending: false })
      .limit(32);
    if (error) throw new Error(`listInProgressResearchSessions: ${error.message}`);
    return (data ?? []).map((r) => rowToSession(r as Record<string, unknown>));
  });
}

export async function loadResearchSession(agentId: string): Promise<ResearchSession | null> {
  if (dbEnabled()) {
    return withSupabaseRetry("loadResearchSession", async () => {
      const { data, error } = await getSupabase()
        .from("research_sessions")
        .select(SESSION_COLUMNS)
        .eq("agent_id", agentId)
        .eq("status", "in_progress")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`loadResearchSession: ${error.message}`);
      return data ? rowToSession(data as Record<string, unknown>) : null;
    });
  }
  const s = readDiskSession(agentId);
  return s?.status === "in_progress" ? s : null;
}

export async function saveResearchSession(session: ResearchSession): Promise<void> {
  const updated = { ...session, updated_at: nowIso() };
  if (dbEnabled()) {
    const { error } = await getSupabase()
      .from("research_sessions")
      .upsert(sessionToRow(updated), { onConflict: "session_id" });
    if (error) throw new Error(`saveResearchSession: ${error.message}`);
    return;
  }
  writeDiskSession(updated);
}

export async function advanceResearchSession(
  agentId: string,
  patch: {
    completed_step?: CompletedStep;
    next_focus?: ResearchFocus | null;
    dequeue?: boolean;
    last_run_id?: string;
    last_run_status?: string;
    connection?: ResearchSession["connections"][0];
    deferred_finding?: string;
    hypotheses?: ResearchHypothesis[];
  },
): Promise<ResearchSession | null> {
  const session = await loadResearchSession(agentId);
  if (!session) return null;

  const queue = [...session.queue];
  if (patch.dequeue && queue.length) queue.shift();

  const completed_steps = [...session.completed_steps];
  if (patch.completed_step) completed_steps.push(patch.completed_step);

  const connections = [...session.connections];
  if (patch.connection) connections.push(patch.connection);

  const deferred_findings = [...session.deferred_findings];
  if (patch.deferred_finding) deferred_findings.push(patch.deferred_finding);

  let current_focus = patch.next_focus !== undefined ? patch.next_focus : session.current_focus;
  if (patch.dequeue) {
    current_focus = queue.length ? (queue[0] ?? null) : (patch.next_focus !== undefined ? patch.next_focus : null);
  }

  const hypotheses = patch.hypotheses ?? session.hypotheses ?? [];

  const updated: ResearchSession = {
    ...session,
    queue,
    hypotheses,
    completed_steps,
    connections,
    deferred_findings,
    current_focus,
    last_run_id: patch.last_run_id ?? session.last_run_id,
    last_run_status: patch.last_run_status ?? session.last_run_status,
    status: queue.length === 0 && !current_focus ? "cycle_complete" : "in_progress",
  };
  await saveResearchSession(updated);
  return updated;
}

export function buildResearchSessionContinuationBlock(
  session: ResearchSession,
  publishSubdir?: string,
): string {
  const lines = [
    "## Continue session (do not restart)",
    "",
    `Session \`${session.session_id}\` — cycle ${session.cycle}, status \`${session.status}\`.`,
    "**Do not repeat completed steps.** Read artifact files on disk before new exploration.",
    "",
  ];
  if (session.goal_id) {
    lines.push(`- **Goal id:** \`${session.goal_id}\``);
    if (publishSubdir) {
      lines.push(
        `- **Whitepaper publish:** \`whitepapers/${publishSubdir}/<slug>/\` (skill \`publish-research-whitepaper\`)`,
      );
    }
    lines.push("");
  }
  if (session.completed_steps.length) {
    lines.push("### Completed steps");
    for (const s of session.completed_steps.slice(-8)) {
      lines.push(`- ${s.id}: ${s.summary}${s.artifact ? ` — \`${s.artifact}\`` : ""}`);
    }
    lines.push("");
  }
  if (session.current_focus) {
    lines.push(
      "### Current focus (complete only this step)",
      "",
      `- kind: \`${session.current_focus.kind}\``,
      `- target: \`${session.current_focus.target}\``,
      "",
    );
  }
  if (session.queue.length) {
    lines.push("### Remaining queue (do not start these yet)", "");
    for (const q of session.queue.slice(0, 6)) {
      const hs = q.hypothesis_status ? ` [${q.hypothesis_status}]` : "";
      lines.push(`- ${q.kind}: ${q.target}${hs}`);
    }
    lines.push("");
  }
  const hyps = session.hypotheses ?? [];
  if (hyps.length) {
    lines.push(
      "### Hypotheses (may be wrong — record outcomes)",
      "",
      "Use lines like `HYPOTHESIS: verified — <statement> | evidence: <file:line or test>` or `HYPOTHESIS: falsified — …`.",
      "Falsified/deferred hypotheses may be **retested** when new evidence appears; do not discard without recording outcome.",
      "",
    );
    for (const h of hyps.slice(-10)) {
      lines.push(
        `- \`${h.id.slice(0, 8)}\` **${h.status}**: ${h.statement}${h.evidence ? ` — ${h.evidence}` : ""}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
