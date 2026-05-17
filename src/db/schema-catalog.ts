/** Control-plane tables (see supabase/migrations/20260517120000_control_plane.sql). */
export const CONTROL_PLANE_TABLES: Array<{
  name: string;
  purpose: string;
  key_columns: string[];
}> = [
  {
    name: "agent_runs",
    purpose: "Agent run history (status, output, completion, PR URLs)",
    key_columns: ["run_id", "agent_id", "started_at", "status", "briefing_hash"],
  },
  {
    name: "agent_run_events",
    purpose: "Timeline events per run",
    key_columns: ["run_id", "seq", "event_type"],
  },
  {
    name: "control_plane_state",
    purpose: "Singleton supervisor state (id=1)",
    key_columns: ["id", "payload", "updated_at"],
  },
  {
    name: "control_plane_reports",
    purpose: "Dashboard reports (is_latest flag)",
    key_columns: ["id", "briefing_hash", "generated_at", "is_latest"],
  },
  {
    name: "interventions_snapshots",
    purpose: "Human intervention lists per tick",
    key_columns: ["id", "briefing_hash", "generated_at", "items"],
  },
  {
    name: "briefing_snapshots",
    purpose: "Preflight briefing JSON by hash",
    key_columns: ["briefing_hash", "generated_at", "payload"],
  },
  {
    name: "heap_plan_snapshots",
    purpose: "Heap coordinator plan per briefing",
    key_columns: ["briefing_hash", "generated_at", "payload"],
  },
  {
    name: "queued_agent_tasks",
    purpose: "Heap queue rows for a briefing",
    key_columns: ["briefing_hash", "fingerprint", "agent_id", "reason"],
  },
  {
    name: "repo_workflow_rollouts",
    purpose: "Agent-kit / repo workflow PR rollouts",
    key_columns: ["run_id", "repo", "pr_url", "install_ok"],
  },
];

export function schemaMarkdown(): string {
  const lines = ["## Control-plane database (public schema)", ""];
  for (const t of CONTROL_PLANE_TABLES) {
    lines.push(`- **\`${t.name}\`** — ${t.purpose}`);
    lines.push(`  - Key columns: ${t.key_columns.map((c) => `\`${c}\``).join(", ")}`);
  }
  lines.push(
    "",
    "Use read-only SQL (`SELECT` / `WITH` / `EXPLAIN`). Prefer MCP tools `list_control_plane_tables`, `describe_table`, `query_control_plane_db`.",
  );
  return lines.join("\n");
}
