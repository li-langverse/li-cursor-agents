import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { agentsPackageRoot } from "../runner.js";
import { dbEnabled, getSupabase } from "../db/client.js";
import { withSupabaseRetry } from "../db/supabase-retry.js";

const HANDOFF_LIST_COLUMNS =
  "handoff_id, research_goal_id, from_agent, to_agents, status, domains, north_star_fit, package_placement, work, research_session_id, briefing_hash, source_run_id, created_at, updated_at, claimed_at, completed_at";
import type { AgentHandoff, CreateHandoffInput, HandoffStatus } from "./types.js";

const HANDOFFS_DIR = () => join(agentsPackageRoot(), "data", "handoffs");
const PENDING_JSONL = () => join(HANDOFFS_DIR(), "pending.jsonl");

function nowIso(): string {
  return new Date().toISOString();
}

function rowToHandoff(row: Record<string, unknown>): AgentHandoff {
  return {
    handoff_id: String(row.handoff_id),
    research_goal_id: row.research_goal_id as string | undefined,
    from_agent: String(row.from_agent),
    to_agents: (row.to_agents as string[]) ?? [],
    status: row.status as HandoffStatus,
    domains: row.domains as string[] | undefined,
    north_star_fit: row.north_star_fit as string | undefined,
    package_placement: (row.package_placement as AgentHandoff["package_placement"]) ?? null,
    work: (row.work as Record<string, unknown>) ?? {},
    research_session_id: row.research_session_id as string | undefined,
    briefing_hash: row.briefing_hash as string | undefined,
    source_run_id: row.source_run_id as string | undefined,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    claimed_at: (row.claimed_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
  };
}

function handoffToRow(h: AgentHandoff): Record<string, unknown> {
  return {
    handoff_id: h.handoff_id,
    research_goal_id: h.research_goal_id ?? null,
    from_agent: h.from_agent,
    to_agents: h.to_agents,
    status: h.status,
    domains: h.domains ?? null,
    north_star_fit: h.north_star_fit ?? null,
    package_placement: h.package_placement ?? null,
    work: h.work,
    research_session_id: h.research_session_id ?? null,
    briefing_hash: h.briefing_hash ?? null,
    source_run_id: h.source_run_id ?? null,
    created_at: h.created_at,
    updated_at: h.updated_at,
    claimed_at: h.claimed_at ?? null,
    completed_at: h.completed_at ?? null,
  };
}

function readDiskHandoffs(): AgentHandoff[] {
  try {
    const raw = readFileSync(PENDING_JSONL(), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => rowToHandoff(JSON.parse(line) as Record<string, unknown>));
  } catch {
    return [];
  }
}

function writeDiskHandoffs(handoffs: AgentHandoff[]): void {
  mkdirSync(HANDOFFS_DIR(), { recursive: true });
  const body = handoffs.map((h) => JSON.stringify(handoffToRow(h))).join("\n");
  writeFileSync(PENDING_JSONL(), body ? `${body}\n` : "", "utf8");
}

export async function createHandoff(input: CreateHandoffInput): Promise<AgentHandoff> {
  const ts = nowIso();
  const handoff: AgentHandoff = {
    handoff_id: randomUUID(),
    research_goal_id: input.research_goal_id,
    from_agent: input.from_agent,
    to_agents: input.to_agents,
    status: input.status ?? "pending_placement",
    domains: input.domains,
    north_star_fit: input.north_star_fit,
    package_placement: input.package_placement ?? null,
    work: input.work ?? {},
    research_session_id: input.research_session_id,
    briefing_hash: input.briefing_hash,
    source_run_id: input.source_run_id,
    created_at: ts,
    updated_at: ts,
    claimed_at: null,
    completed_at: null,
  };

  if (dbEnabled()) {
    const { error } = await getSupabase().from("agent_handoffs").insert(handoffToRow(handoff));
    if (error) throw new Error(`createHandoff: ${error.message}`);
    return handoff;
  }

  const all = readDiskHandoffs();
  all.push(handoff);
  writeDiskHandoffs(all);
  return handoff;
}

export async function updateHandoff(
  handoffId: string,
  patch: Partial<
    Pick<
      AgentHandoff,
      "status" | "package_placement" | "north_star_fit" | "work" | "claimed_at" | "completed_at"
    >
  >,
): Promise<AgentHandoff | null> {
  if (dbEnabled()) {
    const { data, error } = await getSupabase()
      .from("agent_handoffs")
      .update({ ...patch, updated_at: nowIso() })
      .eq("handoff_id", handoffId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`updateHandoff: ${error.message}`);
    return data ? rowToHandoff(data as Record<string, unknown>) : null;
  }

  const all = readDiskHandoffs();
  const idx = all.findIndex((h) => h.handoff_id === handoffId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx]!, ...patch, updated_at: nowIso() };
  writeDiskHandoffs(all);
  return all[idx]!;
}

export async function listHandoffs(filter?: {
  status?: HandoffStatus | HandoffStatus[];
  toAgent?: string;
  limit?: number;
}): Promise<AgentHandoff[]> {
  if (dbEnabled()) {
    return withSupabaseRetry("listHandoffs", async () => {
      let q = getSupabase()
        .from("agent_handoffs")
        .select(HANDOFF_LIST_COLUMNS)
        .order("created_at", { ascending: true });
      if (filter?.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        q = q.in("status", statuses);
      }
      if (filter?.toAgent) {
        q = q.contains("to_agents", [filter.toAgent]);
      }
      if (filter?.limit) q = q.limit(filter.limit);
      const { data, error } = await q;
      if (error) throw new Error(`listHandoffs: ${error.message}`);
      return (data ?? []).map((r) => rowToHandoff(r as Record<string, unknown>));
    });
  }

  let rows = readDiskHandoffs();
  if (filter?.status) {
    const statuses = new Set(Array.isArray(filter.status) ? filter.status : [filter.status]);
    rows = rows.filter((h) => statuses.has(h.status));
  }
  if (filter?.toAgent) rows = rows.filter((h) => h.to_agents.includes(filter.toAgent!));
  if (filter?.limit) rows = rows.slice(0, filter.limit);
  return rows;
}

export async function claimNextHandoff(toAgent: string): Promise<AgentHandoff | null> {
  const statuses =
    toAgent === "package_architect"
      ? (["pending_placement"] as HandoffStatus[])
      : (["pending"] as HandoffStatus[]);
  const pending = await listHandoffs({ status: statuses, toAgent, limit: 50 });
  const target =
    toAgent === "code_implementer"
      ? pending.find((h) => h.package_placement)
      : pending[0];
  if (!target) return null;

  return updateHandoff(target.handoff_id, {
    status: toAgent === "package_architect" ? "pending_placement" : "claimed",
    claimed_at: nowIso(),
  });
}
